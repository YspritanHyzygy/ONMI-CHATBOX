import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

interface Account {
  username: string;
  password: string;
  token: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
    [key: string]: unknown;
  };
}

interface RuntimeSignals {
  consoleErrors: string[];
  pageErrors: string[];
  providerRequests: string[];
}

const PASSWORD = 'Onmi!Pass9';
const signalsByPage = new WeakMap<Page, RuntimeSignals>();
let accountSequence = 0;

function nextUsername(label: string) {
  accountSequence += 1;
  return `e2e_${label.slice(0, 3)}_${Date.now().toString(36)}_${accountSequence}`.slice(0, 20);
}

function isProviderRequest(url: string) {
  return [
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'api.x.ai',
    'localhost:11434',
    '127.0.0.1:11434',
  ].some((host) => url.includes(host));
}

async function createAccount(request: APIRequestContext, label: string): Promise<Account> {
  const username = nextUsername(label);
  const response = await request.post('/api/auth/register', {
    data: {
      username,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      displayName: `E2E ${label}`,
      email: `${username}@example.test`,
    },
  });
  expect(response.ok(), `registration failed with HTTP ${response.status()}`).toBeTruthy();

  const payload = await response.json() as {
    success?: boolean;
    token?: string;
    user?: Account['user'];
    error?: string;
  };
  expect(payload.success, payload.error).toBe(true);
  expect(payload.token).toBeTruthy();
  expect(payload.user?.id).toBeTruthy();

  return {
    username,
    password: PASSWORD,
    token: payload.token!,
    user: payload.user!,
  };
}

async function authenticatePage(page: Page, account: Account) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { user, token, isAuthenticated: true },
      version: 0,
    }));
    localStorage.setItem('gemini_video_webui_user_id', user.id);
  }, { token: account.token, user: account.user });
}

async function createConversation(
  request: APIRequestContext,
  account: Account,
  title: string,
) {
  const response = await request.post('/api/chat', {
    headers: { Authorization: `Bearer ${account.token}` },
    data: {
      message: title,
      provider: 'ollama',
      model: 'onmi-e2e:latest',
    },
  });
  expect(response.ok(), `conversation setup failed with HTTP ${response.status()}`).toBeTruthy();
  const payload = await response.json() as { success?: boolean; conversationId?: string };
  expect(payload.success).toBe(true);
  expect(payload.conversationId).toBeTruthy();
  return { id: payload.conversationId!, title };
}

async function configureMockOllama(request: APIRequestContext, account: Account) {
  const response = await request.post('/api/providers/config', {
    headers: { Authorization: `Bearer ${account.token}` },
    data: {
      providerName: 'ollama',
      baseUrl: 'http://127.0.0.1:4114',
      availableModels: ['onmi-e2e:latest'],
      defaultModel: 'onmi-e2e:latest',
    },
  });
  expect(response.ok(), `mock provider setup failed with HTTP ${response.status()}`).toBeTruthy();
  expect((await response.json() as { success?: boolean }).success).toBe(true);
}

async function waitForMockOllama(request: APIRequestContext) {
  await expect.poll(async () => {
    const response = await request.get('http://127.0.0.1:4114/api/tags').catch(() => null);
    return response?.ok() === true;
  }).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(async () => page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))).toMatchObject({
    viewport: page.viewportSize()!.width,
    document: page.viewportSize()!.width,
    body: page.viewportSize()!.width,
  });
}

test.beforeEach(async ({ page }) => {
  const signals: RuntimeSignals = { consoleErrors: [], pageErrors: [], providerRequests: [] };
  signalsByPage.set(page, signals);

  page.on('console', (message) => {
    if (message.type() === 'error') signals.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => signals.pageErrors.push(error.message));
  page.on('request', (request) => {
    if (isProviderRequest(request.url())) signals.providerRequests.push(request.url());
  });

  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
  });
});

test.afterEach(async ({ page }) => {
  const signals = signalsByPage.get(page);
  expect(signals?.providerRequests, 'E2E smoke tests must never call a real provider').toEqual([]);
  expect(signals?.pageErrors, 'uncaught browser errors').toEqual([]);
  expect(signals?.consoleErrors, 'browser console errors').toEqual([]);
});

test('registers, preserves the session, signs out, and signs back in', async ({ page }) => {
  const username = nextUsername('ui');

  await page.goto('/data');
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('Set password, 6+ characters').fill(PASSWORD);
  await page.getByPlaceholder('Confirm password').fill(PASSWORD);
  await page.getByPlaceholder('Display name, optional').fill('E2E Operator');
  await page.getByRole('button', { name: /Initialize workstation/ }).click();

  await expect(page.getByText('Configure a provider and choose a model before sending a message.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

  await page.reload();
  await expect(page.getByText('Configure a provider and choose a model before sending a message.')).toBeVisible();

  await page.getByTitle('Log out').click();
  await expect(page).toHaveURL(/\/auth$/);

  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('Enter password').fill(PASSWORD);
  await page.getByRole('button', { name: /Enter console/ }).click();
  await expect(page.getByText('Configure a provider and choose a model before sending a message.')).toBeVisible();

  await page.getByRole('link', { name: 'Open API settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('creates the first session atomically through the mocked provider', async ({ page, request }) => {
  const account = await createAccount(request, 'first');
  await waitForMockOllama(request);
  await configureMockOllama(request, account);
  await authenticatePage(page, account);

  await page.goto('/chat');
  const composer = page.getByRole('textbox', { name: 'Chat message' });
  const send = page.getByRole('button', { name: 'Send' });
  await composer.fill('First mocked turn');
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page.getByText('Mock ONMI response', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await expect(page).toHaveURL(/conversation=[0-9a-f-]+/i);

  const conversationId = new URL(page.url()).searchParams.get('conversation');
  expect(conversationId).toBeTruthy();
  const messages = await request.get(
    `/api/chat/conversations/${encodeURIComponent(conversationId!)}/messages`,
    { headers: { Authorization: `Bearer ${account.token}` } },
  );
  expect(messages.ok()).toBeTruthy();
  const payload = await messages.json() as { success?: boolean; data?: Array<{ role?: string; content?: string }> };
  expect(payload.success).toBe(true);
  expect(payload.data).toMatchObject([
    { role: 'user', content: 'First mocked turn' },
    { role: 'assistant', content: 'Mock ONMI response' },
  ]);
});

test('streams and persists an extended-thinking chain through the mocked provider', async ({ page, request }) => {
  const account = await createAccount(request, 'think');
  await waitForMockOllama(request);
  await configureMockOllama(request, account);
  await authenticatePage(page, account);

  await page.goto('/chat');

  await page.getByRole('button', { name: 'Parameters' }).click();
  const thinkingRow = page
    .locator('div.flex.items-center.justify-between')
    .filter({ has: page.getByText('Extended thinking', { exact: true }) });
  await thinkingRow.getByRole('switch').click();
  await page.keyboard.press('Escape');

  const composer = page.getByRole('textbox', { name: 'Chat message' });
  await composer.fill('Why is the sky blue?');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Mock ONMI response', { exact: true })).toBeVisible();
  await expect(page.getByText('Thinking', { exact: true })).toBeVisible();

  // Expand the thinking section and verify the trace renders.
  await page.getByText('Thinking', { exact: true }).click();
  await expect(page.getByText('Mock reasoning trace')).toBeVisible();

  // The chain must be persisted with the assistant message.
  const conversationId = new URL(page.url()).searchParams.get('conversation');
  expect(conversationId).toBeTruthy();
  const messages = await request.get(
    `/api/chat/conversations/${encodeURIComponent(conversationId!)}/messages`,
    { headers: { Authorization: `Bearer ${account.token}` } },
  );
  const payload = await messages.json() as {
    success?: boolean;
    data?: Array<{ role?: string; has_thinking?: boolean; thinking_content?: string }>;
  };
  expect(payload.success).toBe(true);
  const assistant = payload.data?.find((message) => message.role === 'assistant');
  expect(assistant?.has_thinking).toBe(true);
  expect(assistant?.thinking_content).toBe('Mock reasoning trace');
});

test('loads a deep link and manages sidebar sessions without a real provider call', async ({ page, request }) => {
  const account = await createAccount(request, 'chat');
  await waitForMockOllama(request);
  await configureMockOllama(request, account);
  const alpha = await createConversation(request, account, 'Alpha Session');
  const beta = await createConversation(request, account, 'Beta Session');
  await authenticatePage(page, account);

  await page.goto(`/chat?conversation=${encodeURIComponent(alpha.id)}`);
  await expect(page.getByText('Alpha Session', { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`conversation=${alpha.id}`));

  const alphaRow = page.locator('.onmi-session-row').filter({ hasText: 'Alpha Session' });
  page.once('dialog', (dialog) => dialog.accept('Renamed Session'));
  await alphaRow.getByRole('button', { name: 'Rename session' }).click();
  await expect(page.getByText('Renamed Session', { exact: true }).first()).toBeVisible();

  const search = page.getByPlaceholder('Search sessions...');
  await search.fill('Renamed');
  await expect(page.getByText('Renamed Session', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Beta Session', { exact: true })).toBeHidden();

  const renamedRow = page.locator('.onmi-session-row').filter({ hasText: 'Renamed Session' });
  page.once('dialog', (dialog) => dialog.accept());
  await renamedRow.getByRole('button', { name: 'Delete session' }).click();
  await expect(page.getByText('Renamed Session', { exact: true })).toHaveCount(0);

  await search.fill('');
  await expect(page.getByText('Beta Session', { exact: true }).first()).toBeVisible();
  await page.goto(`/chat?conversation=${encodeURIComponent(beta.id)}`);
  await expect(page.getByText('Beta Session', { exact: true }).first()).toBeVisible();

  await page.keyboard.press('Control+K');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();

  await page.getByRole('textbox', { name: 'Chat message' }).focus();
  await page.keyboard.type('/');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+N');
  await expect(page).toHaveURL(/\/chat$/);
});

test('shows database health and requires confirmation for destructive imports', async ({ page, request }) => {
  const account = await createAccount(request, 'data');
  await authenticatePage(page, account);

  await page.goto('/data');
  await expect(page.getByRole('heading', { name: 'Data transfer · Import/Export' })).toBeVisible();
  await expect(page.getByText('Read-only data health report')).toBeVisible();
  await expect(page.getByText('Database version')).toBeVisible();

  const safeBackup = {
    version: '2.0',
    exportDate: new Date().toISOString(),
    conversations: [],
    messages: [],
    aiProviders: [],
    metadata: {
      totalConversations: 0,
      totalMessages: 0,
      totalAIProviders: 0,
      credentialsIncluded: false,
    },
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: 'safe-onmi-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(safeBackup)),
  });
  await expect(page.getByText('safe-onmi-backup.json')).toBeVisible();
  await expect(page.getByText('No provider credentials detected')).toBeVisible();

  await page.getByRole('button', { name: /Replace/ }).click();
  let replacePrompt = '';
  page.once('dialog', async (dialog) => {
    replacePrompt = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Import previewed content' }).click();
  await expect.poll(() => replacePrompt).toContain('Replace mode wipes current conversations');
  await expect(page.getByText('safe-onmi-backup.json')).toBeVisible();

  const rejected = await request.post(`/api/data/import/${encodeURIComponent(account.user.id)}`, {
    headers: { Authorization: `Bearer ${account.token}` },
    data: { data: safeBackup, mergeMode: 'replace', confirmReplace: false },
  });
  expect(rejected.status()).toBe(409);
  const rejectedPayload = await rejected.json() as { success?: boolean; code?: string };
  expect(rejectedPayload).toMatchObject({
    success: false,
    code: 'REPLACE_CONFIRMATION_REQUIRED',
  });
});

test('fits chat, settings, and data at 360, 768, and 1280 pixels', async ({ page, request }) => {
  const account = await createAccount(request, 'layout');
  await authenticatePage(page, account);

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 900 });

    for (const route of ['/chat', '/settings', '/data']) {
      await page.goto(route);
      await expect(page.locator('.onmi-app, .min-h-screen').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('/chat');
    const sidebar = page.locator('#onmi-sidebar');
    const sidebarToggle = page.locator('button[aria-controls="onmi-sidebar"]');
    if (width < 900) {
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
      await sidebarToggle.click();
      await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
      await page.keyboard.press('Escape');
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    } else {
      await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
    }
  }
});
