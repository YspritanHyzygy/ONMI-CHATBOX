import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

interface ApiResponseBody {
  token?: string;
  user?: { id: string; username: string };
  data?: {
    version?: string;
    dbVersion?: number;
    currentVersion?: number;
    [key: string]: unknown;
  };
  code?: string;
}

describe('auth and data route integration', () => {
  let tempDir: string;
  let databasePath: string;
  let server: Server | null = null;
  let baseUrl = '';
  const originalDatabasePath = process.env.GEMINI_VIDEO_WEBUI_DB_PATH;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onmi-auth-routes-'));
    databasePath = path.join(tempDir, 'database.json');
    process.env.GEMINI_VIDEO_WEBUI_DB_PATH = databasePath;
    vi.resetModules();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
      server = null;
    }
    if (originalDatabasePath === undefined) {
      delete process.env.GEMINI_VIDEO_WEBUI_DB_PATH;
    } else {
      process.env.GEMINI_VIDEO_WEBUI_DB_PATH = originalDatabasePath;
    }
    vi.resetModules();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function startApp() {
    const { default: app } = await import('../../app');
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function jsonRequest(
    pathname: string,
    init: RequestInit = {},
    token?: string
  ) {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
    return { response, body: await response.json() as ApiResponseBody };
  }

  it('keeps a session valid across an app reload and revokes it through logout', async () => {
    await startApp();
    const registration = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'route-user',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    expect(registration.response.status).toBe(200);
    const token = registration.body.token!;

    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    server = null;
    vi.resetModules();
    await startApp();

    const currentUser = await jsonRequest('/api/auth/me', {}, token);
    expect(currentUser.response.status).toBe(200);
    expect(currentUser.body.user?.username).toBe('route-user');

    const logout = await jsonRequest('/api/auth/logout', { method: 'POST' }, token);
    expect(logout.response.status).toBe(200);

    const afterLogout = await jsonRequest('/api/auth/me', {}, token);
    expect(afterLogout.response.status).toBe(401);
  });

  it('keeps credentials out of default v2 exports and health responses', async () => {
    await startApp();
    const registration = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'backup-user', password: 'password123' })
    });
    const token = registration.body.token!;
    const userId = registration.body.user!.id;
    const { jsonDatabase } = await import('../../services/json-database');
    await jsonDatabase.updateAIProviderConfig(userId, 'openai', {
      api_key: 'sk-route-secret-1234567890',
      base_url: 'https://api.openai.com/v1',
      available_models: [],
      default_model: 'gpt-4o',
      is_active: true
    });

    const safeExport = await jsonRequest(`/api/data/export/${userId}`, {}, token);
    expect(safeExport.response.status).toBe(200);
    expect(safeExport.body.data?.version).toBe('2.0');
    expect(JSON.stringify(safeExport.body)).not.toContain('sk-route-secret');

    const credentialExport = await jsonRequest(
      `/api/data/export/${userId}?includeCredentials=true`,
      {},
      token
    );
    expect(JSON.stringify(credentialExport.body)).toContain('sk-route-secret-1234567890');

    const health = await jsonRequest('/api/data/health', {}, token);
    expect(health.response.status).toBe(200);
    expect(health.body.data?.dbVersion).toBe(health.body.data?.currentVersion);
    expect(JSON.stringify(health.body)).not.toContain('sk-route-secret');
    expect(JSON.stringify(health.body)).not.toContain('passwordHash');
  });

  it('requires separate replace and credential confirmations for dangerous imports', async () => {
    await startApp();
    const registration = await jsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'import-user', password: 'password123' })
    });
    const token = registration.body.token!;
    const userId = registration.body.user!.id;
    const importData = {
      version: '2.0',
      conversations: [],
      messages: [],
      aiProviders: [{
        id: 'route-provider',
        provider_name: 'openai',
        api_key: 'sk-import-route-secret-1234567890',
        available_models: [],
        is_active: true
      }]
    };

    const noReplaceConfirmation = await jsonRequest(`/api/data/import/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ data: importData, mergeMode: 'replace' })
    }, token);
    expect(noReplaceConfirmation.response.status).toBe(409);
    expect(noReplaceConfirmation.body.code).toBe('REPLACE_CONFIRMATION_REQUIRED');

    const noCredentialConfirmation = await jsonRequest(`/api/data/import/${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        data: importData,
        mergeMode: 'replace',
        confirmReplace: true
      })
    }, token);
    expect(noCredentialConfirmation.response.status).toBe(409);
    expect(noCredentialConfirmation.body.code).toBe('CREDENTIAL_CONFIRMATION_REQUIRED');

    const confirmed = await jsonRequest(`/api/data/import/${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        data: importData,
        mergeMode: 'replace',
        confirmReplace: true,
        confirmCredentials: true
      })
    }, token);
    expect(confirmed.response.status).toBe(200);
  });
});
