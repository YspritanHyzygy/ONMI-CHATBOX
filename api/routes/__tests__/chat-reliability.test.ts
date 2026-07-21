import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  ensureDatabaseInitialized: vi.fn(),
  findUserConfig: vi.fn(),
  validateConfig: vi.fn(),
  getConfigErrorMessage: vi.fn(),
  getValidationErrorMessage: vi.fn(),
  getActualProvider: vi.fn(),
  toAIServiceConfig: vi.fn(),
  streamChat: vi.fn(),
  chat: vi.fn(),
  resolveAuthenticatedUserId: vi.fn()
}));

vi.mock('../../services/database-init.js', () => ({
  ensureDatabaseInitialized: mocks.ensureDatabaseInitialized
}));

vi.mock('../../services/config-manager.js', () => ({
  configManager: {
    findUserConfig: mocks.findUserConfig,
    validateConfig: mocks.validateConfig,
    getConfigErrorMessage: mocks.getConfigErrorMessage,
    getValidationErrorMessage: mocks.getValidationErrorMessage,
    getActualProvider: mocks.getActualProvider,
    toAIServiceConfig: mocks.toAIServiceConfig
  }
}));

vi.mock('../../services/ai-service-manager.js', () => ({
  aiServiceManager: {
    streamChat: mocks.streamChat,
    chat: mocks.chat
  }
}));

vi.mock('../../middleware/auth.js', () => ({
  resolveAuthenticatedUserId: mocks.resolveAuthenticatedUserId
}));

import chatRouter from '../chat.js';

interface ResponseCapture {
  statusCode: number;
  jsonBody?: unknown;
  writes: string[];
  closeListener?: () => void;
  response: Response;
}

function createResponse(): ResponseCapture {
  const capture: ResponseCapture = {
    statusCode: 200,
    writes: [],
    response: undefined as unknown as Response
  };
  const responseObject = {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    status(code: number) {
      capture.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      responseObject.headersSent = true;
      responseObject.writableEnded = true;
      capture.jsonBody = payload;
      return response;
    },
    writeHead(code: number) {
      capture.statusCode = code;
      responseObject.headersSent = true;
      return response;
    },
    write(chunk: unknown) {
      responseObject.headersSent = true;
      capture.writes.push(String(chunk));
      return true;
    },
    end() {
      responseObject.writableEnded = true;
      return response;
    },
    once(event: string, listener: () => void) {
      if (event === 'close') capture.closeListener = listener;
      return response;
    }
  };
  const response = responseObject as unknown as Response;
  capture.response = response;
  return capture;
}

function rootPostHandler() {
  interface RouterLayer {
    route?: {
      path: string;
      methods?: Record<string, boolean>;
      stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
    };
  }
  const layer = (chatRouter as unknown as { stack: RouterLayer[] }).stack.find(item => (
    item.route?.path === '/' && item.route?.methods?.post
  ));
  if (!layer?.route) throw new Error('POST / chat route not found');
  return layer.route.stack[0].handle;
}

function createRequest(body: Record<string, unknown>): Request {
  return {
    body,
    query: { stream: 'true' },
    params: {}
  } as unknown as Request;
}

function ssePayloads(writes: string[]): Array<Record<string, unknown> | '[DONE]'> {
  return writes.join('')
    .split(/\n\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .map(value => value === '[DONE]' ? value : JSON.parse(value) as Record<string, unknown>);
}

function configuredDb(options: { failAssistantPersistence?: boolean } = {}) {
  const insert = vi.fn().mockResolvedValue(options.failAssistantPersistence
    ? { data: null, error: { message: 'disk full' } }
    : { data: { id: 'assistant-1', content: 'hello', role: 'assistant' }, error: null });
  const update = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: { id: 'conversation-1' }, error: null })
  }));
  const select = vi.fn(() => ({
    data: [{ id: 'conversation-1', user_id: 'user-1', title: 'Question' }],
    error: null
  }));
  const deleteTrailingAssistantMessage = vi.fn().mockResolvedValue({
    data: { id: 'assistant-0', role: 'assistant', content: 'old answer' },
    error: null
  });
  const db = {
    prepareChatTurn: vi.fn().mockResolvedValue({
      conversation: { id: 'conversation-1', title: 'Question' },
      message: { id: 'user-1', content: 'Question', role: 'user' }
    }),
    getMessagesByConversationId: vi.fn().mockResolvedValue({
      data: [{ id: 'user-1', content: 'Question', role: 'user' }],
      error: null
    }),
    deleteTrailingAssistantMessage,
    from: vi.fn((table: string) => table === 'messages' ? { insert } : { select, update })
  };
  return { db, insert, deleteTrailingAssistantMessage };
}

function regeneratePostHandler() {
  interface RouterLayer {
    route?: {
      path: string;
      methods?: Record<string, boolean>;
      stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
    };
  }
  const layer = (chatRouter as unknown as { stack: RouterLayer[] }).stack.find(item => (
    item.route?.path === '/conversations/:conversationId/regenerate' && item.route?.methods?.post
  ));
  if (!layer?.route) throw new Error('regenerate route not found');
  return layer.route.stack[0].handle;
}

describe('chat route reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthenticatedUserId.mockReturnValue({ ok: true, userId: 'user-1' });
    mocks.findUserConfig.mockResolvedValue({
      found: true,
      source: 'user',
      config: {
        api_key: 'secret',
        base_url: 'https://api.example.test/v1',
        default_model: 'model-default'
      }
    });
    mocks.validateConfig.mockReturnValue({ valid: true, errors: [], warnings: [] });
    mocks.getActualProvider.mockReturnValue('openai');
    mocks.toAIServiceConfig.mockImplementation((_provider, config, model, parameters) => ({
      provider: 'openai',
      apiKey: config.api_key,
      baseUrl: config.base_url,
      model,
      temperature: parameters?.temperature ?? 0.7
    }));
    mocks.getConfigErrorMessage.mockReturnValue('Provider is not configured');
    mocks.getValidationErrorMessage.mockReturnValue('Provider config is invalid');
  });

  it('uses POST /api/chat as the only first-turn conversation creation route', () => {
    const stack = (chatRouter as unknown as {
      stack: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }>;
    }).stack;
    const standaloneCreateRoute = stack.some((layer) => (
      layer.route?.path === '/conversations' && layer.route.methods?.post === true
    ));

    expect(standaloneCreateRoute).toBe(false);
  });

  it('validates provider configuration before creating a chat turn', async () => {
    mocks.findUserConfig.mockResolvedValue({ found: false, source: 'none' });
    const capture = createResponse();

    await rootPostHandler()(createRequest({ message: 'Question', provider: 'openai' }), capture.response);

    expect(capture.statusCode).toBe(400);
    expect(capture.jsonBody).toEqual({ success: false, error: 'Provider is not configured' });
    expect(mocks.ensureDatabaseInitialized).not.toHaveBeenCalled();
  });

  it('emits conversation metadata first and completion only after persistence', async () => {
    const { db } = configuredDb();
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    mocks.streamChat.mockImplementation(async function* () {
      yield { content: 'hello', done: false, model: 'model-default', provider: 'openai' };
      yield { content: '', done: true, model: 'model-default', provider: 'openai' };
    });
    const capture = createResponse();

    await rootPostHandler()(createRequest({ message: 'Question', provider: 'openai' }), capture.response);

    const payloads = ssePayloads(capture.writes);
    expect(payloads[0]).toEqual({
      type: 'conversation',
      conversationId: 'conversation-1',
      title: 'Question'
    });
    expect(payloads.at(-2)).toMatchObject({ done: true, content: '' });
    expect(payloads.at(-1)).toBe('[DONE]');
    expect(db.prepareChatTurn).toHaveBeenCalledOnce();
    expect(db.prepareChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: undefined,
      message: expect.objectContaining({ model: 'model-default' })
    }));
  });

  it('reports persistence failure before any provider completion event', async () => {
    const { db, insert } = configuredDb({ failAssistantPersistence: true });
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    mocks.streamChat.mockImplementation(async function* () {
      yield { content: 'hello', done: false, model: 'model-default', provider: 'openai' };
      yield { content: '', done: true, model: 'model-default', provider: 'openai' };
    });
    const capture = createResponse();

    await rootPostHandler()(createRequest({ message: 'Question', provider: 'openai' }), capture.response);

    const payloads = ssePayloads(capture.writes);
    const errorIndex = payloads.findIndex(payload => payload !== '[DONE]' && payload.type === 'error');
    const providerDoneIndex = payloads.findIndex(payload => (
      payload !== '[DONE]' && payload.done === true && payload.type !== 'error'
    ));
    expect(insert).toHaveBeenCalledOnce();
    expect(errorIndex).toBeGreaterThan(0);
    expect(providerDoneIndex).toBe(-1);
  });

  it('forwards thinking chunks over SSE and persists thinking content, tokens, and signature', async () => {
    const { db, insert } = configuredDb();
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    mocks.toAIServiceConfig.mockImplementation((_provider, config, model, parameters) => ({
      provider: 'openai',
      apiKey: config.api_key,
      baseUrl: config.base_url,
      model,
      enableThinking: parameters?.enableThinking,
      reasoningEffort: parameters?.reasoningEffort
    }));
    mocks.streamChat.mockImplementation(async function* () {
      yield {
        content: '', done: false, model: 'model-default', provider: 'openai',
        thinking: { content: 'because the user asked...', done: false }
      };
      yield {
        content: '', done: false, model: 'model-default', provider: 'openai',
        thinking: { content: '', done: true, tokens: 42, signature: 'sig-abc' }
      };
      yield { content: 'hello', done: false, model: 'model-default', provider: 'openai' };
      yield { content: '', done: true, model: 'model-default', provider: 'openai' };
    });
    const capture = createResponse();

    await rootPostHandler()(createRequest({
      message: 'Question',
      provider: 'openai',
      parameters: { enableThinking: true, reasoningEffort: 'high' }
    }), capture.response);

    const payloads = ssePayloads(capture.writes);
    const thinkingPayload = payloads.find(payload => (
      payload !== '[DONE]' && typeof payload.thinking === 'object' && payload.thinking !== null
    )) as Record<string, any> | undefined;
    expect(thinkingPayload?.thinking?.content).toBe('because the user asked...');

    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      has_thinking: true,
      thinking_content: 'because the user asked...',
      thinking_tokens: 42,
      reasoning_effort: 'high',
      thought_signature: 'sig-abc'
    }));
  });

  it('regenerates the trailing assistant reply: deletes it, replays the turn, and persists the new one', async () => {
    const { db, insert, deleteTrailingAssistantMessage } = configuredDb();
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    mocks.streamChat.mockImplementation(async function* () {
      yield { content: 'better answer', done: false, model: 'model-default', provider: 'openai' };
      yield { content: '', done: true, model: 'model-default', provider: 'openai' };
    });
    const capture = createResponse();
    const request = {
      body: { provider: 'openai', model: 'model-default', stream: true },
      query: { stream: 'true' },
      params: { conversationId: 'conversation-1' }
    } as unknown as Request;

    await regeneratePostHandler()(request, capture.response);

    expect(deleteTrailingAssistantMessage).toHaveBeenCalledWith('conversation-1');
    // No new user message may be inserted - only the assistant reply.
    expect(db.prepareChatTurn).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant',
      content: 'better answer'
    }));
    const payloads = ssePayloads(capture.writes);
    expect(payloads.at(-1)).toBe('[DONE]');
  });

  it('rejects regeneration when the conversation has no trailing user message', async () => {
    const { db, insert } = configuredDb();
    db.getMessagesByConversationId.mockResolvedValue({ data: [], error: null });
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    const capture = createResponse();
    const request = {
      body: { provider: 'openai', model: 'model-default' },
      query: {},
      params: { conversationId: 'conversation-1' }
    } as unknown as Request;

    await regeneratePostHandler()(request, capture.response);

    expect(capture.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it('aborts the upstream stream and does not persist a partial assistant reply', async () => {
    const { db, insert } = configuredDb();
    mocks.ensureDatabaseInitialized.mockResolvedValue(db);
    const capture = createResponse();
    let observedSignal: AbortSignal | undefined;
    mocks.streamChat.mockImplementation(async function* (
      _provider: unknown,
      _messages: unknown,
      aiConfig: { signal?: AbortSignal }
    ) {
      observedSignal = aiConfig.signal;
      capture.closeListener?.();
      yield { content: 'partial', done: false, model: 'model-default', provider: 'openai' };
    });

    await rootPostHandler()(createRequest({ message: 'Question', provider: 'openai' }), capture.response);

    expect(observedSignal?.aborted).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });
});
