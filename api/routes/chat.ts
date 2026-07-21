import { Router, type Request, type Response } from 'express';
import { aiServiceManager } from '../services/ai-service-manager.js';
import type { AIProvider, AIServiceConfig } from '../services/types.js';
import {
  validateAIServiceConfig,
  validateChatRequest
} from '../services/request-validator.js';
import { configManager } from '../services/config-manager.js';
import { ensureDatabaseInitialized } from '../services/database-init.js';
import { sanitizeErrorMessage } from '../services/error-utils.js';
import { resolveAuthenticatedUserId } from '../middleware/auth.js';
import { buildChatContext } from '../services/chat-context.js';

const router = Router();

interface ChatOverrides {
  conversationId: string;
  message: unknown;
  stream: boolean;
}

type AbortableAIConfig = AIServiceConfig & { signal?: AbortSignal };

interface DatabaseFailure {
  message?: string;
  code?: string;
}

interface ConversationRecord extends Record<string, unknown> {
  id: string;
  user_id: string;
  title: string;
  provider_used?: string;
  model_used?: string;
}

interface MessageRecord extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  provider?: string;
  model?: string;
}

interface DatabaseResult<T> {
  data: T | null;
  error: DatabaseFailure | null;
}

interface DatabaseTable<T> {
  select(): DatabaseResult<T[]>;
  insert(record: Record<string, unknown>): Promise<DatabaseResult<T>>;
  update(record: Record<string, unknown>): {
    eq(field: string, value: unknown): Promise<DatabaseResult<T>>;
  };
}

interface ChatDatabase {
  from(table: 'conversations'): DatabaseTable<ConversationRecord>;
  from(table: 'messages'): DatabaseTable<MessageRecord>;
  prepareChatTurn(input: {
    userId: string;
    conversationId?: string;
    title?: string;
    message: {
      content: string;
      role: 'user';
      provider?: string;
      model?: string;
    };
  }): Promise<{ conversation: ConversationRecord; message: MessageRecord }>;
  getConversationsByUserId(userId: string): Promise<DatabaseResult<ConversationRecord[]>>;
  getMessagesByConversationId(conversationId: string): Promise<DatabaseResult<MessageRecord[]>>;
  forkConversationForUser(userId: string, conversationId: string): Promise<DatabaseResult<{
    conversation: ConversationRecord;
    messages: MessageRecord[];
  }>>;
  deleteConversationById(conversationId: string): Promise<DatabaseResult<ConversationRecord>>;
  clearConversationsByUserId(userId: string): Promise<void>;
}

async function getChatDatabase(): Promise<ChatDatabase> {
  return await ensureDatabaseInitialized() as unknown as ChatDatabase;
}

function getConversationAccess(db: ChatDatabase, conversationId: string, userId: string) {
  const conversations = db.from('conversations').select().data;
  const conversation = conversations?.find(item => item.id === conversationId);
  if (!conversation) {
    return { ok: false as const, status: 404, error: 'Conversation not found' };
  }
  if (conversation.user_id !== userId) {
    return { ok: false as const, status: 403, error: 'Conversation belongs to another user' };
  }
  return { ok: true as const, conversation };
}

async function withConversationSummaries(db: ChatDatabase, conversations: ConversationRecord[]) {
  return Promise.all(conversations.map(async conversation => {
    const { data: messages, error } = await db.getMessagesByConversationId(conversation.id);
    if (error) throw new Error(error.message || 'Failed to load conversation messages');
    const safeMessages = Array.isArray(messages) ? messages : [];
    const lastMessage = safeMessages[safeMessages.length - 1];
    return {
      ...conversation,
      preview: lastMessage?.content || '',
      message_count: safeMessages.length,
      provider_used: conversation.provider_used || lastMessage?.provider,
      model_used: conversation.model_used || lastMessage?.model
    };
  }));
}

function titleFromMessage(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 60) || 'New conversation';
}

function routeParam(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[]>)[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function databaseErrorStatus(error: unknown): number {
  const candidate = error as { code?: string; status?: number; statusCode?: number };
  if (candidate.status || candidate.statusCode) return candidate.status || candidate.statusCode || 500;
  if (candidate.code === 'FORBIDDEN') return 403;
  if (candidate.code === 'NOT_FOUND') return 404;
  if (candidate.code === 'INVALID_PARAM' || candidate.code === 'INVALID_DATA') return 400;
  return 500;
}

function writeSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startSse(res: Response, conversation: { id: string; title: string }): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });
  // This metadata event must remain first so clients can adopt an atomically
  // created conversation before provider content begins streaming.
  writeSse(res, {
    type: 'conversation',
    conversationId: conversation.id,
    title: conversation.title
  });
}

async function persistAssistantMessage(
  db: ChatDatabase,
  input: {
    conversationId: string;
    content: string;
    provider: AIProvider;
    model: string;
    thinking?: {
      content?: string;
      tokens?: number;
      effort?: string;
      signature?: string;
    };
  }
) {
  const { data, error } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    content: input.content,
    role: 'assistant',
    provider: input.provider,
    model: input.model,
    has_thinking: !!input.thinking?.content,
    thinking_content: input.thinking?.content,
    thinking_tokens: input.thinking?.tokens,
    reasoning_effort: input.thinking?.effort,
    thought_signature: input.thinking?.signature
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to persist assistant message');
  }
  return data;
}

async function handleChatRequest(
  req: Request,
  res: Response,
  overrides?: ChatOverrides
): Promise<void> {
  const body = typeof req.body === 'object' && req.body !== null
    ? req.body as Record<string, unknown>
    : {};
  const legacyParameters = typeof body.parameters === 'object' && body.parameters !== null
    ? body.parameters as Record<string, unknown>
    : {};
  const requestBody = overrides ? {
    ...body,
    message: overrides.message,
    conversationId: overrides.conversationId,
    parameters: {
      ...legacyParameters,
      enableThinking: body.enableThinking,
      thinkingBudget: body.thinkingBudget,
      reasoningEffort: body.reasoningEffort,
      includeThoughts: body.includeThoughts,
      thoughtSignatures: body.thoughtSignatures
    }
  } : body;
  const streamRequested = overrides?.stream ?? req.query['stream'] === 'true';

  const validation = validateChatRequest(requestBody);
  if (!validation.valid || !validation.data) {
    res.status(400).json({ success: false, error: validation.errors.join(', ') });
    return;
  }

  const { message, provider, model, conversationId, parameters } = validation.data;
  const scopedUser = resolveAuthenticatedUserId(req, validation.data.userId);
  if (!scopedUser.ok) {
    res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
    return;
  }

  // Provider, configuration and final model are resolved before any write. A
  // missing provider must never leave behind an empty conversation.
  const configLookup = await configManager.findUserConfig(scopedUser.userId, provider);
  if (!configLookup.found || !configLookup.config) {
    res.status(400).json({
      success: false,
      error: configManager.getConfigErrorMessage(provider, configLookup)
    });
    return;
  }

  const providerConfig = configLookup.config;
  const configValidation = configManager.validateConfig(provider, providerConfig);
  if (!configValidation.valid) {
    res.status(400).json({
      success: false,
      error: configManager.getValidationErrorMessage(provider, configValidation)
    });
    return;
  }

  const finalModel = (model || providerConfig.default_model || '').trim();
  if (!finalModel) {
    res.status(400).json({ success: false, error: 'A model must be selected' });
    return;
  }

  const actualProvider = configManager.getActualProvider(provider, providerConfig, parameters);
  const aiConfig = configManager.toAIServiceConfig(
    actualProvider,
    providerConfig,
    finalModel,
    parameters
  ) as AbortableAIConfig;
  const serviceValidation = validateAIServiceConfig(aiConfig);
  if (!serviceValidation.valid) {
    res.status(400).json({ success: false, error: serviceValidation.errors.join(', ') });
    return;
  }

  const db = await getChatDatabase();
  let prepared: { conversation: ConversationRecord; message: MessageRecord };
  try {
    prepared = await db.prepareChatTurn({
      userId: scopedUser.userId,
      conversationId,
      title: titleFromMessage(message),
      message: {
        content: message,
        role: 'user',
        provider: actualProvider,
        model: finalModel
      }
    });
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : 'Failed to prepare chat turn';
    res.status(databaseErrorStatus(error)).json({ success: false, error: messageText });
    return;
  }

  const targetConversationId = prepared.conversation.id as string;
  const historyResult = await db.getMessagesByConversationId(targetConversationId);
  if (historyResult.error) {
    res.status(500).json({ success: false, error: 'Failed to load conversation context' });
    return;
  }

  const messages = buildChatContext(historyResult.data, actualProvider, { maxCompletedTurns: 10 });
  if (!messages.some(item => item.role === 'user')) {
    res.status(500).json({ success: false, error: 'Conversation context has no user message' });
    return;
  }

  const abortController = new AbortController();
  aiConfig.signal = abortController.signal;
  res.once('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  if (streamRequested) {
    startSse(res, prepared.conversation);
  }

  try {
    const providerCanStream = actualProvider !== 'openai-responses';
    if (streamRequested && providerCanStream) {
      let content = '';
      let thinkingContent = '';
      let thinkingTokens: number | undefined;
      let thinkingSignature: string | undefined;
      let completed = false;
      let responseModel = finalModel;

      for await (const chunk of aiServiceManager.streamChat(actualProvider, messages, aiConfig)) {
        if (abortController.signal.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        content += chunk.content || '';
        thinkingContent += chunk.thinking?.content || '';
        if (chunk.thinking?.tokens !== undefined) thinkingTokens = chunk.thinking.tokens;
        if (chunk.thinking?.signature) thinkingSignature = chunk.thinking.signature;
        responseModel = chunk.model || responseModel;
        if (chunk.done) {
          if (chunk.content || chunk.thinking?.content) {
            writeSse(res, { ...chunk, done: false });
          }
          completed = true;
          break;
        }
        writeSse(res, { ...chunk, done: false });
      }

      if (!completed || abortController.signal.aborted || !content.trim()) {
        throw new Error(completed ? 'Provider returned an empty response' : 'Provider stream ended before completion');
      }

      await persistAssistantMessage(db, {
        conversationId: targetConversationId,
        content,
        provider: actualProvider,
        model: finalModel,
        thinking: {
          content: thinkingContent || undefined,
          tokens: thinkingTokens,
          effort: aiConfig.enableThinking ? aiConfig.reasoningEffort : undefined,
          signature: thinkingSignature
        }
      });
      writeSse(res, {
        content: '',
        done: true,
        model: responseModel,
        provider: actualProvider
      });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const aiResponse = await aiServiceManager.chat(actualProvider, messages, aiConfig);
    if (abortController.signal.aborted || !aiResponse.content?.trim()) {
      throw new Error(abortController.signal.aborted
        ? 'The operation was aborted'
        : 'Provider returned an empty response');
    }

    const aiMessage = await persistAssistantMessage(db, {
      conversationId: targetConversationId,
      content: aiResponse.content,
      provider: actualProvider,
      model: finalModel,
      thinking: aiResponse.thinking
    });

    if (streamRequested) {
      writeSse(res, {
        content: aiResponse.content,
        done: false,
        model: aiResponse.model,
        provider: actualProvider
      });
      writeSse(res, {
        content: '',
        done: true,
        model: aiResponse.model,
        provider: actualProvider
      });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.json({
      success: true,
      response: aiResponse.content,
      conversationId: targetConversationId,
      data: { userMessage: prepared.message, aiMessage }
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'Provider request failed';
    const sanitized = sanitizeErrorMessage(rawMessage);
    const aborted = abortController.signal.aborted || (error as { name?: string }).name === 'AbortError';
    console.error('[Chat] Provider request failed', {
      provider: actualProvider,
      model: finalModel,
      aborted,
      error: sanitized
    });

    // The user message remains available for retry. Provider errors and partial
    // assistant output are intentionally never persisted as normal context.
    if (res.headersSent) {
      if (!res.destroyed) {
        writeSse(res, {
          type: aborted ? 'cancelled' : 'error',
          error: aborted ? 'Generation cancelled' : sanitized,
          content: '',
          done: true
        });
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    res.status(aborted ? 499 : 502).json({
      success: false,
      error: aborted ? 'Generation cancelled' : sanitized,
      conversationId: targetConversationId
    });
  }
}

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const scopedUser = resolveAuthenticatedUserId(req, req.query['userId']);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }

    const db = await getChatDatabase();
    const { data, error } = await db.getConversationsByUserId(scopedUser.userId);
    if (error) {
      res.status(500).json({ success: false, error: 'Failed to load conversations' });
      return;
    }

    const conversations = await withConversationSummaries(db, data || []);
    // Keep both fields for older clients.
    res.json({ success: true, data: conversations, conversations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Chat] Failed to list conversations', message);
    res.status(500).json({ success: false, error: 'Failed to load conversations' });
  }
});

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = routeParam(req, 'conversationId');
    const scopedUser = resolveAuthenticatedUserId(req);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }

    const db = await getChatDatabase();
    const access = getConversationAccess(db, conversationId, scopedUser.userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, error: access.error });
      return;
    }

    const { data, error } = await db.getMessagesByConversationId(conversationId);
    if (error) {
      res.status(500).json({ success: false, error: 'Failed to load messages' });
      return;
    }
    res.json({ success: true, data: data || [] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

router.patch('/conversations/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = routeParam(req, 'conversationId');
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 120) {
      res.status(400).json({ success: false, error: 'title must contain 1 to 120 characters' });
      return;
    }

    const scopedUser = resolveAuthenticatedUserId(req);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }

    const db = await getChatDatabase();
    const access = getConversationAccess(db, conversationId, scopedUser.userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, error: access.error });
      return;
    }

    const { data, error } = await db.from('conversations').update({ title }).eq('id', conversationId);
    if (error || !data) {
      res.status(500).json({ success: false, error: error?.message || 'Failed to rename conversation' });
      return;
    }
    res.json({ success: true, data, conversation: data });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to rename conversation' });
  }
});

router.post('/conversations/:conversationId/fork', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = routeParam(req, 'conversationId');
    const scopedUser = resolveAuthenticatedUserId(req);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }

    const db = await getChatDatabase();
    const access = getConversationAccess(db, conversationId, scopedUser.userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, error: access.error });
      return;
    }

    const { data, error } = await db.forkConversationForUser(scopedUser.userId, conversationId);
    if (error || !data) {
      res.status(error?.code === 'NOT_FOUND' ? 404 : 500).json({
        success: false,
        error: error?.message || 'Failed to fork conversation'
      });
      return;
    }
    res.json({ success: true, data, conversation: data.conversation, messages: data.messages });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fork conversation' });
  }
});

router.post('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  await handleChatRequest(req, res, {
    conversationId: routeParam(req, 'conversationId'),
    message: req.body?.content,
    stream: req.body?.stream === true
  });
});

router.delete('/conversations/:conversationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = routeParam(req, 'conversationId');
    const scopedUser = resolveAuthenticatedUserId(req);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }

    const db = await getChatDatabase();
    const access = getConversationAccess(db, conversationId, scopedUser.userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, error: access.error });
      return;
    }

    const { error } = await db.deleteConversationById(conversationId);
    if (error) {
      res.status(500).json({ success: false, error: 'Failed to delete conversation' });
      return;
    }
    res.json({ success: true, message: 'Conversation deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

router.delete('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const scopedUser = resolveAuthenticatedUserId(req);
    if (!scopedUser.ok) {
      res.status(scopedUser.status).json({ success: false, error: scopedUser.error });
      return;
    }
    const db = await getChatDatabase();
    await db.clearConversationsByUserId(scopedUser.userId);
    res.json({ success: true, message: 'All conversations deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete conversations' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    await handleChatRequest(req, res);
  } catch (error: unknown) {
    const message = error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error';
    console.error('[Chat] Request failed', message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Chat request failed' });
    } else if (!res.destroyed) {
      writeSse(res, { type: 'error', error: 'Chat request failed', content: '', done: true });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

export default router;
