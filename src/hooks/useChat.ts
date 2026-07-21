import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth, isPageTearingDown } from '@/lib/fetch';
import { sanitizeThinkingParams } from '@/lib/thinking-support';
import {
  getValidatedConversations,
  getValidatedModel,
  setStorageItem,
} from '@/lib/storage';

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'cancelled';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isTyping?: boolean;
  useTypewriter?: boolean;
  hasThinking?: boolean;
  thinkingContent?: string;
  thinkingTokens?: number;
  reasoningEffort?: string;
  thoughtSignature?: string;
  status?: MessageStatus;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: Date;
  provider?: string;
  model?: string;
  /** False only for an optimistic first turn that the server has not accepted yet. */
  persisted?: boolean;
}

export interface ModelOption {
  provider: string;
  providerName: string;
  model: string;
  displayName: string;
}

export interface AIParameters {
  temperature: number;
  maxTokens?: number;
  topP: number;
  useResponsesAPI?: boolean;
  /** 扩展思考（thinking/reasoning）开关；随 parameters 原样发给后端 */
  enableThinking?: boolean;
  /** 思维预算 token 数（Claude/Gemini 2.5；-1 表示动态） */
  thinkingBudget?: number;
  /** 推理努力程度（OpenAI/xAI/Gemini 3） */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  researchTools?: {
    webSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
  };
  background?: boolean;
}

type LoadState = 'loading' | 'ready' | 'error';

interface JsonRecord {
  [key: string]: unknown;
}

const STREAM_IDLE_TIMEOUT_MS = 120_000;

function randomId(prefix = '') {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}${id}`;
}

function getConversationIdFromUrl() {
  return new URLSearchParams(window.location.search).get('conversation');
}

function updateConversationUrl(conversationId?: string) {
  const url = new URL(window.location.href);
  if (conversationId) url.searchParams.set('conversation', conversationId);
  else url.searchParams.delete('conversation');
  window.history.replaceState({}, '', url.toString());
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function hasConfiguredSecret(value: unknown): boolean {
  const secret = getString(value).trim();
  return Boolean(secret && secret !== 'undefined' && secret !== 'null');
}

function isUsableHttpUrl(value: unknown): boolean {
  const raw = getString(value).trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizeMessage(raw: JsonRecord): Message {
  return {
    id: getString(raw.id, randomId('message-')),
    content: getString(raw.content),
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    timestamp: new Date(getString(raw.created_at) || getString(raw.timestamp) || Date.now()),
    hasThinking: Boolean(raw.has_thinking ?? raw.hasThinking),
    thinkingContent: getString(raw.thinking_content ?? raw.thinkingContent) || undefined,
    thinkingTokens: typeof (raw.thinking_tokens ?? raw.thinkingTokens) === 'number'
      ? Number(raw.thinking_tokens ?? raw.thinkingTokens)
      : undefined,
    reasoningEffort: getString(raw.reasoning_effort ?? raw.reasoningEffort) || undefined,
    thoughtSignature: getString(raw.thought_signature ?? raw.thoughtSignature) || undefined,
    status: 'complete',
    isTyping: false,
  };
}

function normalizeConversation(raw: JsonRecord): Conversation {
  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];
  return {
    id: getString(raw.id),
    title: getString(raw.title, 'Untitled session'),
    created_at: new Date(getString(raw.created_at) || Date.now()),
    provider: getString(raw.provider ?? raw.provider_used) || undefined,
    model: getString(raw.model ?? raw.model_used) || undefined,
    messages: rawMessages
      .filter((message): message is JsonRecord => Boolean(message) && typeof message === 'object')
      .map(normalizeMessage),
    persisted: true,
  };
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

function createCacheSnapshot(conversations: Conversation[]) {
  return conversations
    .filter((conversation) => conversation.persisted !== false)
    .map((conversation) => ({
      ...conversation,
      persisted: true,
      messages: conversation.messages.filter((message) => (
        message.role === 'user' || message.status === 'complete' || !message.status
      )),
    }));
}

async function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('STREAM_IDLE_TIMEOUT')), STREAM_IDLE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** 一轮生成过程中累积的助手消息内容（正文 + 思维链） */
interface StreamSnapshot {
  content: string;
  thinkingContent: string;
  thinkingTokens?: number;
  reasoningEffort?: string;
  thoughtSignature?: string;
}

/**
 * 消费 /api/chat 系列端点的 SSE 响应（发送与重新生成共用）。
 * 每收到一块数据调用 onProgress(snapshot, finished)；[DONE] 时 finished=true。
 * 服务端错误、空流、断流、闲置超时均以异常抛出（超时时错误信息为
 * 'STREAM_IDLE_TIMEOUT'，由调用方决定如何提示并中止）。
 */
async function consumeAssistantSse(options: {
  response: Response;
  emptyStreamError: string;
  incompleteError: string;
  onConversation?: (conversationId: string, title?: string) => void;
  onProgress: (snapshot: StreamSnapshot, finished: boolean) => void;
}): Promise<void> {
  const reader = options.response.body?.getReader();
  if (!reader) throw new Error(options.emptyStreamError);
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  const snapshot: StreamSnapshot = { content: '', thinkingContent: '' };

  const processData = (dataText: string) => {
    if (!dataText) return;
    if (dataText === '[DONE]') {
      finished = true;
      options.onProgress({ ...snapshot }, true);
      return;
    }
    const data = JSON.parse(dataText) as JsonRecord;
    if (data.type === 'conversation') {
      options.onConversation?.(getString(data.conversationId), getString(data.title));
      return;
    }
    if (typeof data.error === 'string') throw new Error(data.error);
    if (typeof data.content === 'string') snapshot.content += data.content;
    const thinking = data.thinking && typeof data.thinking === 'object' ? data.thinking as JsonRecord : null;
    if (thinking && typeof thinking.content === 'string') snapshot.thinkingContent += thinking.content;
    if (thinking && typeof thinking.tokens === 'number') snapshot.thinkingTokens = thinking.tokens;
    if (thinking && typeof thinking.effort === 'string') snapshot.reasoningEffort = thinking.effort;
    if (thinking && typeof thinking.signature === 'string') snapshot.thoughtSignature = thinking.signature;
    options.onProgress({ ...snapshot }, false);
  };

  const processBuffer = (flush = false) => {
    const lines = buffer.split(/\r?\n/);
    buffer = flush ? '' : lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      processData(line.slice(5).trim());
    }
  };

  try {
    while (!finished) {
      const { done, value } = await readWithTimeout(reader);
      if (done) {
        buffer += decoder.decode();
        processBuffer(true);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
    if (!finished) throw new Error(options.incompleteError);
  } finally {
    try { reader.releaseLock(); } catch { /* stream already released */ }
  }
}

export function useChat() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [aiParameters, setAiParameters] = useState<AIParameters>({
    temperature: 0.7,
    maxTokens: undefined,
    topP: 1,
    useResponsesAPI: false,
  });
  const [conversationsState, setConversationsState] = useState<LoadState>('loading');
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [conversationLoadError, setConversationLoadError] = useState<string | null>(null);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [providerConfigState, setProviderConfigState] = useState<LoadState>('loading');
  const [providerConfigError, setProviderConfigError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const conversationAbortRef = useRef<AbortController | null>(null);
  const conversationsAbortRef = useRef<AbortController | null>(null);
  const providerConfigAbortRef = useRef<AbortController | null>(null);
  const conversationRequestRef = useRef(0);
  const conversationsRef = useRef<Conversation[]>([]);
  const currentConversationRef = useRef<Conversation | null>(null);
  const viewRevisionRef = useRef(0);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  const saveConversationsToStorage = useCallback((next: Conversation[]) => {
    const result = setStorageItem('conversations', createCacheSnapshot(next));
    if (!result.success) console.error('Failed to save conversation cache:', result.error);
  }, []);

  const commitConversations = useCallback((updater: (previous: Conversation[]) => Conversation[]) => {
    setConversations((previous) => {
      const next = updater(previous);
      conversationsRef.current = next;
      saveConversationsToStorage(next);
      return next;
    });
  }, [saveConversationsToStorage]);

  const handleModelChange = useCallback((model: ModelOption) => {
    setSelectedModel(model);
    const result = setStorageItem('selectedModel', model);
    if (!result.success) console.error('Failed to save model:', result.error);
  }, []);

  const loadSelectedModel = useCallback(() => {
    const result = getValidatedModel('selectedModel');
    setSelectedModel(result.success && result.data ? result.data as ModelOption : null);
  }, []);

  const loadConversationsFromStorage = useCallback(() => {
    const result = getValidatedConversations('conversations');
    if (!result.success || !result.data) return;
    const cached = result.data
      .filter((value): value is JsonRecord => Boolean(value) && typeof value === 'object')
      .map(normalizeConversation)
      .filter((conversation) => Boolean(conversation.id));
    conversationsRef.current = cached;
    setConversations(cached);
  }, []);

  const loadUserSettings = useCallback(async () => {
    providerConfigAbortRef.current?.abort();
    const controller = new AbortController();
    providerConfigAbortRef.current = controller;
    try {
      setProviderConfigState('loading');
      setProviderConfigError(null);
      const [configResponse, providerResponse] = await Promise.all([
        fetchWithAuth('/api/providers/config', { signal: controller.signal }).catch(() => null),
        fetchWithAuth('/api/providers', { signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      const configResult = configResponse?.ok
        ? await configResponse.json().catch(() => ({})) as { success?: boolean; data?: JsonRecord[] }
        : null;
      const providerResult = providerResponse?.ok
        ? await providerResponse.json().catch(() => ({})) as { success?: boolean; data?: JsonRecord[] }
        : null;
      if (controller.signal.aborted) return;
      const hasConfigResult = configResult?.success === true && Array.isArray(configResult.data);
      const hasProviderResult = providerResult?.success === true && Array.isArray(providerResult.data);
      if (!hasConfigResult && !hasProviderResult) {
        throw new Error(t('chat.loadProviderConfigFailed', { defaultValue: 'Could not verify provider configuration.' }));
      }
      const savedConfigs = hasConfigResult ? configResult!.data! : [];
      const providerSummaries = hasProviderResult ? providerResult!.data! : [];
      const openaiConfig = savedConfigs.find((config) => config.provider_name === 'openai');
      const configured = new Set<string>(providerSummaries.flatMap((provider) => {
        // The provider list also contains active-but-incomplete user records.
        // Only its environment entries are authoritative; saved user configs
        // are validated for the fields required by each provider below.
        if (provider.source !== 'environment') return [];
        const name = getString(provider.id ?? provider.provider_name);
        return name ? [name] : [];
      }));
      for (const config of savedConfigs) {
        const providerName = getString(config.provider_name);
        const isActive = config.is_active !== false && config.is_active !== 'false';
        const hasRequiredConfig = isUsableHttpUrl(config.base_url)
          && (providerName === 'ollama' || hasConfiguredSecret(config.api_key));
        if (providerName && isActive && hasRequiredConfig) configured.add(providerName);
      }
      setConfiguredProviders([...configured]);
      setAiParameters((previous) => ({
        ...previous,
        useResponsesAPI: openaiConfig?.use_responses_api === 'true',
      }));
      setProviderConfigState('ready');
    } catch (error) {
      if (controller.signal.aborted || isPageTearingDown()) return;
      console.error('Failed to load user settings:', error);
      setConfiguredProviders([]);
      setProviderConfigState('error');
      setProviderConfigError(error instanceof Error ? error.message : t('chat.loadProviderConfigFailed', { defaultValue: 'Could not verify provider configuration.' }));
    } finally {
      if (providerConfigAbortRef.current === controller) {
        providerConfigAbortRef.current = null;
      }
    }
  }, [t]);

  const loadConversationMessages = useCallback(async (
    conversation: Conversation,
    updateUrl = true,
  ) => {
    viewRevisionRef.current += 1;
    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;
    const requestId = ++conversationRequestRef.current;

    currentConversationRef.current = conversation;
    setCurrentConversation(conversation);
    setConversationLoadError(null);
    setIsConversationLoading(true);
    if (updateUrl) updateConversationUrl(conversation.id);

    try {
      const response = await fetchWithAuth(
        `/api/chat/conversations/${encodeURIComponent(conversation.id)}/messages`,
        { signal: controller.signal },
      );
      const result = await response.json().catch(() => ({})) as JsonRecord;
      if (!response.ok || result.success !== true || !Array.isArray(result.data)) {
        throw new Error(getErrorMessage(result, t('chat.loadMessagesFailed', { defaultValue: 'Failed to load this session.' })));
      }

      const messages = result.data
        .filter((value): value is JsonRecord => Boolean(value) && typeof value === 'object')
        .map(normalizeMessage);
      if (controller.signal.aborted || requestId !== conversationRequestRef.current) return;

      const latestConversation = currentConversationRef.current?.id === conversation.id
        ? currentConversationRef.current
        : conversation;
      const withMessages = { ...latestConversation, messages, persisted: true };
      currentConversationRef.current = withMessages;
      setCurrentConversation(withMessages);
      commitConversations((previous) => previous.map((item) => (
        item.id === conversation.id ? { ...item, messages, persisted: true } : item
      )));
    } catch (error) {
      if (controller.signal.aborted || requestId !== conversationRequestRef.current) return;
      setConversationLoadError(error instanceof Error
        ? error.message
        : t('chat.loadMessagesFailed', { defaultValue: 'Failed to load this session.' }));
    } finally {
      if (requestId === conversationRequestRef.current) setIsConversationLoading(false);
    }
  }, [commitConversations, t]);

  const handleConversationSelect = useCallback(async (conversation: Conversation) => {
    await loadConversationMessages(conversation, true);
  }, [loadConversationMessages]);

  const loadConversations = useCallback(async () => {
    conversationsAbortRef.current?.abort();
    const controller = new AbortController();
    conversationsAbortRef.current = controller;
    const conversationIdsAtStart = new Set(
      conversationsRef.current.map((conversation) => conversation.id),
    );
    const requestedAtStart = getConversationIdFromUrl();
    const needsDeepLinkLoad = Boolean(
      requestedAtStart && currentConversationRef.current?.id !== requestedAtStart,
    );
    setConversationsState('loading');
    setConversationsError(null);
    if (needsDeepLinkLoad) {
      setConversationLoadError(null);
      setIsConversationLoading(true);
    }

    try {
      const response = await fetchWithAuth('/api/chat/conversations', { signal: controller.signal });
      const result = await response.json().catch(() => ({})) as JsonRecord;
      if (!response.ok || result.success !== true) {
        throw new Error(getErrorMessage(result, t('chat.loadConversationsFailed', { defaultValue: 'Failed to load sessions.' })));
      }
      const rawList = Array.isArray(result.conversations)
        ? result.conversations
        : Array.isArray(result.data)
          ? result.data
          : [];
      const next = rawList
        .filter((value): value is JsonRecord => Boolean(value) && typeof value === 'object')
        .map(normalizeConversation)
        .filter((conversation) => Boolean(conversation.id))
        .sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      if (controller.signal.aborted) return;

      // A first message can finish creating its conversation while this list
      // request is in flight. Preserve those newer records instead of letting
      // the older list snapshot erase the active stream from the sidebar.
      const conversationsCreatedWhileLoading = conversationsRef.current.filter((conversation) => (
        conversation.persisted !== false
        && !conversationIdsAtStart.has(conversation.id)
      ));
      const concurrentById = new Map(
        conversationsCreatedWhileLoading.map((conversation) => [conversation.id, conversation]),
      );
      const mergedServerNext = next.map((conversation) => {
        const concurrent = concurrentById.get(conversation.id);
        return concurrent
          ? {
            ...conversation,
            messages: concurrent.messages,
            provider: concurrent.provider || conversation.provider,
            model: concurrent.model || conversation.model,
          }
          : conversation;
      });
      const resolvedNext = [
        ...conversationsCreatedWhileLoading.filter((conversation) => (
          !next.some((item) => item.id === conversation.id)
        )),
        ...mergedServerNext,
      ];
      conversationsRef.current = resolvedNext;
      setConversations(resolvedNext);
      saveConversationsToStorage(resolvedNext);
      setConversationsState('ready');

      const requestedId = getConversationIdFromUrl();
      if (requestedId) {
        const requested = resolvedNext.find((conversation) => conversation.id === requestedId);
        if (requested) {
          const wasCreatedWhileLoading = conversationsCreatedWhileLoading.some(
            (conversation) => conversation.id === requestedId,
          );
          if (!wasCreatedWhileLoading && currentConversationRef.current?.id !== requestedId) {
            await loadConversationMessages(requested, false);
          }
        } else if (currentConversationRef.current?.id !== requestedId) {
          setCurrentConversation(null);
          setConversationLoadError(t('chat.conversationNotFound', { defaultValue: 'This session no longer exists.' }));
          setIsConversationLoading(false);
        }
      } else if (needsDeepLinkLoad) {
        setIsConversationLoading(false);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error
        ? error.message
        : t('chat.loadConversationsFailed', { defaultValue: 'Failed to load sessions.' });
      setConversationsState('error');
      setConversationsError(message);
      if (
        needsDeepLinkLoad
        && getConversationIdFromUrl() === requestedAtStart
        && currentConversationRef.current?.id !== requestedAtStart
      ) {
        setConversationLoadError(message);
        setIsConversationLoading(false);
      }
    }
  }, [loadConversationMessages, saveConversationsToStorage, t]);

  useEffect(() => {
    loadConversationsFromStorage();
    loadSelectedModel();
    void Promise.all([loadUserSettings(), loadConversations()]);
    return () => {
      generationAbortRef.current?.abort();
      conversationAbortRef.current?.abort();
      conversationsAbortRef.current?.abort();
      providerConfigAbortRef.current?.abort();
    };
  }, [loadConversations, loadConversationsFromStorage, loadSelectedModel, loadUserSettings]);

  useEffect(() => {
    const handleStorageChange = (event: Event) => {
      if (event instanceof StorageEvent && event.key && event.key !== 'selectedModel') return;
      if (event instanceof CustomEvent && event.detail?.key && event.detail.key !== 'selectedModel') return;
      loadSelectedModel();
      void loadUserSettings();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageChanged', handleStorageChange);
    window.addEventListener('modelsUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChanged', handleStorageChange);
      window.removeEventListener('modelsUpdated', handleStorageChange);
    };
  }, [loadSelectedModel, loadUserSettings]);

  useEffect(() => {
    const handlePopState = () => {
      const conversationId = getConversationIdFromUrl();
      if (!conversationId) {
        viewRevisionRef.current += 1;
        conversationAbortRef.current?.abort();
        currentConversationRef.current = null;
        setCurrentConversation(null);
        setConversationLoadError(null);
        setIsConversationLoading(false);
        return;
      }
      const conversation = conversationsRef.current.find((item) => item.id === conversationId);
      if (conversation) void loadConversationMessages(conversation, false);
      else {
        viewRevisionRef.current += 1;
        conversationAbortRef.current?.abort();
        currentConversationRef.current = null;
        setCurrentConversation(null);
        setIsConversationLoading(false);
        setConversationLoadError(t('chat.conversationNotFound', { defaultValue: 'This session no longer exists.' }));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadConversationMessages, t]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [inputMessage]);

  const forkCurrentConversation = useCallback(async () => {
    const conversation = currentConversationRef.current;
    if (!conversation || conversation.persisted === false) {
      throw new Error(t('chat.noConversationToFork', { defaultValue: 'No saved session to fork.' }));
    }

    const response = await fetchWithAuth(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || result.success !== true) {
      throw new Error(getErrorMessage(result, t('chat.forkFailed', { defaultValue: 'Failed to fork session.' })));
    }

    const rawConversation = (result.conversation || (result.data as JsonRecord | undefined)?.conversation) as JsonRecord | undefined;
    const rawMessages = (result.messages || (result.data as JsonRecord | undefined)?.messages) as unknown;
    if (!rawConversation) throw new Error(t('chat.forkFailed', { defaultValue: 'Failed to fork session.' }));
    const forked = normalizeConversation({
      ...rawConversation,
      messages: Array.isArray(rawMessages) ? rawMessages : [],
    });

    viewRevisionRef.current += 1;
    conversationAbortRef.current?.abort();
    conversationRequestRef.current += 1;
    currentConversationRef.current = forked;
    setCurrentConversation(forked);
    commitConversations((previous) => [forked, ...previous.filter((item) => item.id !== forked.id)]);
    updateConversationUrl(forked.id);
    return forked;
  }, [commitConversations, t]);

  const handleSendMessage = useCallback(async () => {
    const text = inputMessage.trim();
    const providerReady = Boolean(selectedModel && configuredProviders.includes(selectedModel.provider));
    if (!text || isLoading || !selectedModel || !providerReady) return;
    const viewRevision = ++viewRevisionRef.current;

    const existing = currentConversationRef.current;
    const isSavedConversation = Boolean(existing && existing.persisted !== false && !existing.id.startsWith('draft-'));
    const localConversationId = isSavedConversation ? existing!.id : randomId('draft-');
    const userMessage: Message = {
      id: randomId('user-'),
      content: text,
      role: 'user',
      timestamp: new Date(),
      status: 'complete',
    };
    const assistantMessageId = randomId('assistant-');
    const assistantMessage: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isTyping: true,
      status: 'streaming',
    };
    const baseMessages = isSavedConversation ? existing!.messages : [];
    const optimisticConversation: Conversation = {
      id: localConversationId,
      title: isSavedConversation
        ? existing!.title
        : `${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`,
      messages: [...baseMessages, userMessage, assistantMessage],
      created_at: isSavedConversation ? existing!.created_at : new Date(),
      provider: selectedModel.provider,
      model: selectedModel.model,
      persisted: isSavedConversation,
    };

    setConversationLoadError(null);
    currentConversationRef.current = optimisticConversation;
    setCurrentConversation(optimisticConversation);
    if (isSavedConversation) {
      commitConversations((previous) => previous.map((conversation) => (
        conversation.id === existing!.id ? optimisticConversation : conversation
      )));
    }
    setInputMessage('');
    setIsLoading(true);

    const controller = new AbortController();
    generationAbortRef.current = controller;
    let serverConversationId = isSavedConversation ? existing!.id : '';
    let fullContent = '';
    let fullThinkingContent = '';
    let thinkingTokens: number | undefined;
    let reasoningEffort: string | undefined;
    let thoughtSignature: string | undefined;
    let streamTimedOut = false;

    const matchesActiveTurn = (conversation: Conversation) => (
      conversation.id === localConversationId || conversation.id === serverConversationId
    );

    const updateAssistant = (patch: Partial<Message>) => {
      const update = (conversation: Conversation): Conversation => ({
        ...conversation,
        messages: conversation.messages.map((message) => (
          message.id === assistantMessageId ? { ...message, ...patch } : message
        )),
      });
      setCurrentConversation((previous) => {
        const next = previous && matchesActiveTurn(previous) ? update(previous) : previous;
        currentConversationRef.current = next;
        return next;
      });
      setConversations((previous) => {
        const next = previous.map((conversation) => (
          matchesActiveTurn(conversation) ? update(conversation) : conversation
        ));
        conversationsRef.current = next;
        return next;
      });
    };

    const applyConversationMetadata = (conversationId: string, title?: string) => {
      if (!conversationId) return;
      serverConversationId = conversationId;
      const convert = (conversation: Conversation): Conversation => ({
        ...conversation,
        id: conversationId,
        title: title?.trim() || conversation.title,
        provider: selectedModel.provider,
        model: selectedModel.model,
        persisted: true,
      });
      const activeConversation = currentConversationRef.current;
      const convertedTurn = convert(
        activeConversation && matchesActiveTurn(activeConversation)
          ? activeConversation
          : optimisticConversation,
      );
      if (activeConversation && matchesActiveTurn(activeConversation)) {
        currentConversationRef.current = convertedTurn;
        setCurrentConversation(convertedTurn);
      }
      const previous = conversationsRef.current;
      const existingIndex = previous.findIndex((conversation) => matchesActiveTurn(conversation));
      const next = existingIndex >= 0
        ? previous.map((conversation, index) => index === existingIndex
          ? { ...convert(conversation), messages: convertedTurn.messages }
          : conversation)
        : [convertedTurn, ...previous];
      conversationsRef.current = next;
      setConversations(next);
      if (viewRevisionRef.current === viewRevision) updateConversationUrl(conversationId);
    };

    try {
      const url = new URL('/api/chat', window.location.origin);
      url.searchParams.set('stream', 'true');
      const body: JsonRecord = {
        message: text,
        provider: selectedModel.provider,
        model: selectedModel.model,
        // 不支持思考的模型剥除思维参数（localStorage 可能残留其他模型的开关）
        parameters: sanitizeThinkingParams(aiParameters, selectedModel.provider, selectedModel.model),
      };
      if (isSavedConversation) body.conversationId = existing!.id;

      const response = await fetchWithAuth(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(getErrorMessage(payload, `${t('chat.sendMessageError')} (${response.status})`));
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        try {
          await consumeAssistantSse({
            response,
            emptyStreamError: t('chat.emptyStream', { defaultValue: 'The server returned an empty stream.' }),
            incompleteError: t('chat.partialResponseNotice', { defaultValue: 'The connection closed before the response completed.' }),
            onConversation: applyConversationMetadata,
            onProgress: (snapshot, finished) => {
              fullContent = snapshot.content;
              fullThinkingContent = snapshot.thinkingContent;
              thinkingTokens = snapshot.thinkingTokens;
              reasoningEffort = snapshot.reasoningEffort;
              thoughtSignature = snapshot.thoughtSignature;
              updateAssistant({
                content: fullContent,
                isTyping: !finished,
                status: finished ? 'complete' : 'streaming',
                error: undefined,
                hasThinking: Boolean(fullThinkingContent),
                thinkingContent: fullThinkingContent || undefined,
                thinkingTokens,
                reasoningEffort,
                thoughtSignature,
              });
            },
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'STREAM_IDLE_TIMEOUT') {
            streamTimedOut = true;
            controller.abort();
            throw new Error(t('chat.streamTimeout', { defaultValue: 'The response timed out. You can retry the message.' }));
          }
          throw error;
        }
      } else {
        const data = await response.json() as JsonRecord;
        if (data.success !== true) throw new Error(getErrorMessage(data, t('chat.unknownError')));
        applyConversationMetadata(getString(data.conversationId), getString(data.title));
        const aiMessage = data.data && typeof data.data === 'object'
          ? (data.data as JsonRecord).aiMessage as JsonRecord | undefined
          : undefined;
        fullContent = getString(data.response ?? aiMessage?.content);
        updateAssistant({
          content: fullContent,
          isTyping: false,
          status: 'complete',
          hasThinking: Boolean(aiMessage?.has_thinking),
          thinkingContent: getString(aiMessage?.thinking_content) || undefined,
          thinkingTokens: typeof aiMessage?.thinking_tokens === 'number' ? aiMessage.thinking_tokens : undefined,
          reasoningEffort: getString(aiMessage?.reasoning_effort) || undefined,
          thoughtSignature: getString(aiMessage?.thought_signature) || undefined,
        });
      }
    } catch (error) {
      const wasStopped = controller.signal.aborted && !streamTimedOut;
      const message = wasStopped
        ? t('chat.stoppedResponseNotice', { defaultValue: 'Stopped by you. The partial response was not added to future context.' })
        : error instanceof Error
          ? error.message
          : t('chat.unknownError');
      updateAssistant({
        content: fullContent,
        isTyping: false,
        status: wasStopped ? 'cancelled' : 'error',
        error: message,
        hasThinking: Boolean(fullThinkingContent),
        thinkingContent: fullThinkingContent || undefined,
        thinkingTokens,
        reasoningEffort,
        thoughtSignature,
      });
      setInputMessage((current) => current || text);
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsLoading(false);
      setConversations((previous) => {
        saveConversationsToStorage(previous);
        return previous;
      });
    }
  }, [aiParameters, commitConversations, configuredProviders, inputMessage, isLoading, saveConversationsToStorage, selectedModel, t]);

  const stopGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  /**
   * 重新生成当前会话最后一条助手回复。
   * 服务端会删除该回复并基于同一条用户消息重新执行一轮；
   * 上一轮以错误/取消结束时同样可用（等价于重试）。
   */
  const regenerateLastMessage = useCallback(async () => {
    const conversation = currentConversationRef.current;
    if (isLoading || !selectedModel) return;
    if (!conversation || conversation.persisted === false || conversation.id.startsWith('draft-')) return;
    if (!configuredProviders.includes(selectedModel.provider)) return;
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    const conversationId = conversation.id;
    const assistantMessageId = randomId('assistant-');
    const assistantMessage: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isTyping: true,
      status: 'streaming',
    };

    const replaceTrailingAssistant = (target: Conversation): Conversation => ({
      ...target,
      messages: [...target.messages.slice(0, -1), assistantMessage],
    });
    setCurrentConversation((previous) => {
      const next = previous && previous.id === conversationId ? replaceTrailingAssistant(previous) : previous;
      currentConversationRef.current = next;
      return next;
    });
    setConversations((previous) => {
      const next = previous.map((item) => (item.id === conversationId ? replaceTrailingAssistant(item) : item));
      conversationsRef.current = next;
      return next;
    });
    setIsLoading(true);

    const controller = new AbortController();
    generationAbortRef.current = controller;
    let snapshotState: StreamSnapshot = { content: '', thinkingContent: '' };
    let streamTimedOut = false;

    const updateAssistant = (patch: Partial<Message>) => {
      const update = (target: Conversation): Conversation => ({
        ...target,
        messages: target.messages.map((message) => (
          message.id === assistantMessageId ? { ...message, ...patch } : message
        )),
      });
      setCurrentConversation((previous) => {
        const next = previous && previous.id === conversationId ? update(previous) : previous;
        currentConversationRef.current = next;
        return next;
      });
      setConversations((previous) => {
        const next = previous.map((item) => (item.id === conversationId ? update(item) : item));
        conversationsRef.current = next;
        return next;
      });
    };

    try {
      const url = new URL(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/regenerate`,
        window.location.origin,
      );
      url.searchParams.set('stream', 'true');
      const response = await fetchWithAuth(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedModel.provider,
          model: selectedModel.model,
          parameters: sanitizeThinkingParams(aiParameters, selectedModel.provider, selectedModel.model),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(getErrorMessage(payload, `${t('chat.sendMessageError')} (${response.status})`));
      }

      try {
        await consumeAssistantSse({
          response,
          emptyStreamError: t('chat.emptyStream', { defaultValue: 'The server returned an empty stream.' }),
          incompleteError: t('chat.partialResponseNotice', { defaultValue: 'The connection closed before the response completed.' }),
          onProgress: (snapshot, finished) => {
            snapshotState = snapshot;
            updateAssistant({
              content: snapshot.content,
              isTyping: !finished,
              status: finished ? 'complete' : 'streaming',
              error: undefined,
              hasThinking: Boolean(snapshot.thinkingContent),
              thinkingContent: snapshot.thinkingContent || undefined,
              thinkingTokens: snapshot.thinkingTokens,
              reasoningEffort: snapshot.reasoningEffort,
              thoughtSignature: snapshot.thoughtSignature,
            });
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'STREAM_IDLE_TIMEOUT') {
          streamTimedOut = true;
          controller.abort();
          throw new Error(t('chat.streamTimeout', { defaultValue: 'The response timed out. You can retry the message.' }));
        }
        throw error;
      }
    } catch (error) {
      const wasStopped = controller.signal.aborted && !streamTimedOut;
      const message = wasStopped
        ? t('chat.stoppedResponseNotice', { defaultValue: 'Stopped by you. The partial response was not added to future context.' })
        : error instanceof Error
          ? error.message
          : t('chat.unknownError');
      updateAssistant({
        content: snapshotState.content,
        isTyping: false,
        status: wasStopped ? 'cancelled' : 'error',
        error: message,
        hasThinking: Boolean(snapshotState.thinkingContent),
        thinkingContent: snapshotState.thinkingContent || undefined,
        thinkingTokens: snapshotState.thinkingTokens,
        reasoningEffort: snapshotState.reasoningEffort,
        thoughtSignature: snapshotState.thoughtSignature,
      });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsLoading(false);
      setConversations((previous) => {
        saveConversationsToStorage(previous);
        return previous;
      });
    }
  }, [aiParameters, configuredProviders, isLoading, saveConversationsToStorage, selectedModel, t]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  }, [handleSendMessage]);

  const createNewConversation = useCallback(() => {
    viewRevisionRef.current += 1;
    conversationAbortRef.current?.abort();
    currentConversationRef.current = null;
    setCurrentConversation(null);
    setConversationLoadError(null);
    setIsConversationLoading(false);
    setInputMessage('');
    updateConversationUrl();
    queueMicrotask(() => textareaRef.current?.focus());
  }, []);

  const clearAllConversations = useCallback(async () => {
    if (isLoading) {
      throw new Error(t('chat.stopBeforeDelete', { defaultValue: 'Stop the active generation before clearing sessions.' }));
    }
    const response = await fetchWithAuth('/api/chat/conversations', { method: 'DELETE' });
    const result = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || result.success !== true) {
      throw new Error(getErrorMessage(result, t('chat.clearFailed', { defaultValue: 'Failed to clear sessions.' })));
    }
    conversationsAbortRef.current?.abort();
    conversationAbortRef.current?.abort();
    conversationRequestRef.current += 1;
    setConversations([]);
    conversationsRef.current = [];
    viewRevisionRef.current += 1;
    currentConversationRef.current = null;
    setCurrentConversation(null);
    setConversationsState('ready');
    setConversationsError(null);
    setConversationLoadError(null);
    setIsConversationLoading(false);
    saveConversationsToStorage([]);
    updateConversationUrl();
  }, [isLoading, saveConversationsToStorage, t]);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle.length > 120) {
      throw new Error(t('chat.invalidTitle', { defaultValue: 'Session titles must be between 1 and 120 characters.' }));
    }
    const response = await fetchWithAuth(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle }),
    });
    const result = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || result.success !== true) {
      throw new Error(getErrorMessage(result, t('chat.renameFailed', { defaultValue: 'Failed to rename session.' })));
    }
    conversationsAbortRef.current?.abort();
    commitConversations((previous) => previous.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, title: nextTitle } : conversation
    )));
    setCurrentConversation((previous) => {
      const next = previous?.id === conversationId ? { ...previous, title: nextTitle } : previous;
      currentConversationRef.current = next;
      return next;
    });
  }, [commitConversations, t]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    if (isLoading) {
      throw new Error(t('chat.stopBeforeDelete', { defaultValue: 'Stop the active generation before deleting sessions.' }));
    }
    const response = await fetchWithAuth(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
    const result = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || result.success !== true) {
      throw new Error(getErrorMessage(result, t('chat.deleteFailed', { defaultValue: 'Failed to delete session.' })));
    }
    conversationsAbortRef.current?.abort();
    commitConversations((previous) => previous.filter((conversation) => conversation.id !== conversationId));
    if (currentConversationRef.current?.id === conversationId) {
      conversationAbortRef.current?.abort();
      conversationRequestRef.current += 1;
      viewRevisionRef.current += 1;
      currentConversationRef.current = null;
      setCurrentConversation(null);
      setConversationLoadError(null);
      setIsConversationLoading(false);
      updateConversationUrl();
    }
    setConversationsState('ready');
    setConversationsError(null);
  }, [commitConversations, isLoading, t]);

  const retryCurrentConversation = useCallback(() => {
    const conversationId = currentConversationRef.current?.id || getConversationIdFromUrl();
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (conversation) void loadConversationMessages(conversation, false);
    else void loadConversations();
  }, [loadConversationMessages, loadConversations]);

  const formatTime = useCallback((date: Date) => {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const diffMinutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes });
    if (diffMinutes < 1440) return t('time.hoursAgo', { count: Math.floor(diffMinutes / 60) });
    return value.toLocaleDateString();
  }, [t]);

  return {
    conversations,
    currentConversation,
    inputMessage,
    setInputMessage,
    isLoading,
    selectedModel,
    providerReady: Boolean(selectedModel && configuredProviders.includes(selectedModel.provider)),
    providerConfigState,
    providerConfigError,
    aiParameters,
    setAiParameters,
    messagesEndRef,
    textareaRef,
    conversationsState,
    conversationsError,
    isConversationLoading,
    conversationLoadError,
    handleModelChange,
    handleSendMessage,
    stopGeneration,
    regenerateLastMessage,
    handleKeyPress,
    createNewConversation,
    forkCurrentConversation,
    clearAllConversations,
    renameConversation,
    deleteConversation,
    retryConversations: loadConversations,
    retryCurrentConversation,
    formatTime,
    handleConversationSelect,
  };
}
