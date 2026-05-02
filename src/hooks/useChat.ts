import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth } from '@/lib/fetch';
import {
  getValidatedModel,
  getValidatedConversations,
  setStorageItem
} from '@/lib/storage';

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
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: Date;
  provider?: string;
  model?: string;
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
  researchTools?: {
    webSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
  };
  background?: boolean;
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
    topP: 1.0,
    useResponsesAPI: false
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleModelChange = useCallback((model: ModelOption) => {
    try {
      setSelectedModel(model);
      const result = setStorageItem('selectedModel', model);
      if (!result.success) {
        console.error('Failed to save model:', result.error);
      }
    } catch (error) {
      console.error('Model selection failed:', error);
    }
  }, []);

  const saveConversationsToStorage = useCallback((convs: Conversation[]) => {
    const result = setStorageItem('conversations', convs);
    if (!result.success) {
      console.error('Failed to save conversations:', result.error);
    }
  }, []);

  const loadConversationsFromStorage = useCallback(() => {
    const result = getValidatedConversations('conversations');
    if (result.success && result.data) {
      const convs = result.data.map((conv: any) => ({
        ...conv,
        created_at: new Date(conv.created_at),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
      setConversations(convs);
    }
  }, []);

  const loadSelectedModel = useCallback(() => {
    const result = getValidatedModel('selectedModel');
    if (result.success && result.data) {
      setSelectedModel(result.data);
    }
  }, []);

  const loadUserSettings = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/providers/config');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const openaiConfig = result.data.find((config: any) => config.provider_name === 'openai');
          if (openaiConfig && openaiConfig.use_responses_api === 'true') {
            setAiParameters(prev => ({ ...prev, useResponsesAPI: true }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/chat/conversations');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
          const apiConversations = data.conversations.map((conv: any) => ({
            ...conv,
            created_at: new Date(conv.created_at)
          }));
          apiConversations.sort((a: any, b: any) => b.created_at.getTime() - a.created_at.getTime());
          setConversations(apiConversations);
          saveConversationsToStorage(apiConversations);
        }
      }
    } catch (error) {
      console.error('API call failed:', error);
    }
  }, [saveConversationsToStorage]);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetchWithAuth(`/api/chat/conversations/${conversationId}/messages`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          return result.data.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            role: msg.role,
            timestamp: new Date(msg.created_at),
            hasThinking: msg.has_thinking,
            thinkingContent: msg.thinking_content,
            thinkingTokens: msg.thinking_tokens,
            reasoningEffort: msg.reasoning_effort,
            thoughtSignature: msg.thought_signature
          }));
        }
      }
      return [];
    } catch (error) {
      console.error('Failed to load messages:', error);
      return [];
    }
  }, []);

  const checkUrlParams = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get('conversation');
    if (conversationId && conversations.length > 0) {
      const conversation = conversations.find(conv => conv.id === conversationId);
      if (conversation) {
        setCurrentConversation(conversation);
      }
    }
  }, [conversations]);

  // Initialize
  useEffect(() => {
    loadConversationsFromStorage();
    loadSelectedModel();
    loadUserSettings().catch(console.error);
    setTimeout(() => {
      loadConversations().catch(console.error);
    }, 1000);
  }, []);

  // Check URL params when conversations load
  useEffect(() => {
    if (conversations.length > 0) {
      checkUrlParams();
    }
  }, [conversations, checkUrlParams]);

  // Sync localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      loadSelectedModel();
      loadUserSettings();
      loadConversationsFromStorage();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageChanged', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChanged', handleStorageChange);
    };
  }, [loadSelectedModel, loadUserSettings, loadConversationsFromStorage]);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation?.messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isLoading) return;

    setIsLoading(true);
    let conversation = currentConversation;

    if (!conversation) {
      conversation = {
        id: self.crypto?.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        title: inputMessage.slice(0, 30) + (inputMessage.length > 30 ? '...' : ''),
        messages: [],
        created_at: new Date(),
        provider: selectedModel?.provider || 'openai',
        model: selectedModel?.model || 'gpt-3.5-turbo'
      };

      const newConversations = [conversation!, ...conversations];
      setConversations(newConversations);
      saveConversationsToStorage(newConversations);
      setCurrentConversation(conversation);

      fetchWithAuth('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conversation.id,
          title: conversation.title,
          provider: conversation.provider,
          model: conversation.model
        })
      }).catch(error => console.error('Failed to create conversation:', error));

      const url = new URL(window.location.href);
      url.searchParams.set('conversation', conversation.id);
      window.history.replaceState({}, '', url.toString());
    }

    const userMessage: Message = {
      id: self.crypto?.randomUUID?.() || Math.random().toString(36).substr(2, 9),
      content: inputMessage,
      role: 'user',
      timestamp: new Date()
    };

    const updatedConversation = {
      ...conversation,
      provider: selectedModel?.provider || 'openai',
      model: selectedModel?.model || 'gpt-3.5-turbo',
      messages: [...conversation.messages, userMessage]
    };

    setCurrentConversation(updatedConversation);
    setConversations(prevConversations => {
      const newConversations = prevConversations.map(conv =>
        conv.id === conversation!.id ? updatedConversation : conv
      );
      saveConversationsToStorage(newConversations);
      return newConversations;
    });

    setInputMessage('');

    const aiMessageId = self.crypto?.randomUUID?.() || Math.random().toString(36).substr(2, 9);
    const aiMessage: Message = {
      id: aiMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isTyping: true
    };

    const conversationWithAiMessage = {
      ...updatedConversation,
      messages: [...updatedConversation.messages, aiMessage]
    };
    setCurrentConversation(conversationWithAiMessage);
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(conv =>
        conv.id === conversation!.id ? conversationWithAiMessage : conv
      );
      saveConversationsToStorage(updatedConversations);
      return updatedConversations;
    });

    try {
      const url = new URL('/api/chat', window.location.origin);
      url.searchParams.set('stream', 'true');

      const response = await fetchWithAuth(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputMessage,
          provider: updatedConversation.provider,
          model: updatedConversation.model,
          conversationId: updatedConversation.id,
          parameters: aiParameters
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`${t('chat.sendMessageError')}: ${errorData.error || response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let fullThinkingContent = '';
        let thinkingTokens: number | undefined;
        let reasoningEffort: string | undefined;
        let thoughtSignature: string | undefined;

        if (reader) {
          let streamTimedOut = false;
          try {
            let streamTimeout: NodeJS.Timeout | null = null;
            let lastChunkTime = Date.now();
            let streamCompleted = false;
            const STREAM_IDLE_TIMEOUT_MS = 120000;
            const STREAM_TIMEOUT_CHECK_INTERVAL_MS = 5000;

            const clearStreamTimeout = () => {
              if (streamTimeout) { clearTimeout(streamTimeout); streamTimeout = null; }
            };

            const restartStreamTimeout = () => {
              clearStreamTimeout();
              streamTimeout = setTimeout(() => {
                if (Date.now() - lastChunkTime > STREAM_IDLE_TIMEOUT_MS) {
                  streamTimedOut = true;
                  void reader.cancel();
                  return;
                }
                restartStreamTimeout();
              }, STREAM_TIMEOUT_CHECK_INTERVAL_MS);
            };

            const applyMessageUpdate = (messageUpdater: (msg: any) => any) => {
              setCurrentConversation(prev => {
                if (!prev) return prev;
                return { ...prev, messages: prev.messages.map(messageUpdater) };
              });
              setConversations(prev =>
                prev.map(conv =>
                  conv.id === conversation!.id
                    ? { ...conv, messages: conv.messages.map(messageUpdater) }
                    : conv
                )
              );
            };

            const processStreamDataLine = (dataStr: string): boolean => {
              if (dataStr === '[DONE]') {
                streamCompleted = true;
                applyMessageUpdate(msg =>
                  msg.id === aiMessageId
                    ? { ...msg, content: fullContent, isTyping: false, hasThinking: !!fullThinkingContent, thinkingContent: fullThinkingContent || undefined, thinkingTokens, reasoningEffort, thoughtSignature }
                    : msg
                );
                clearStreamTimeout();
                return true;
              }

              try {
                const data = JSON.parse(dataStr);
                if (data.error) {
                  streamCompleted = true;
                  applyMessageUpdate(msg =>
                    msg.id === aiMessageId ? { ...msg, content: `${t('chat.sendError')}${data.error}`, isTyping: false } : msg
                  );
                  clearStreamTimeout();
                  return true;
                }

                if (data.content !== undefined) fullContent += data.content;
                if (data.thinking?.content) fullThinkingContent += data.thinking.content;
                if (data.thinking?.tokens !== undefined) thinkingTokens = data.thinking.tokens;
                if (data.thinking?.effort) reasoningEffort = data.thinking.effort;
                if (data.thinking?.signature) thoughtSignature = data.thinking.signature;

                applyMessageUpdate(msg =>
                  msg.id === aiMessageId
                    ? { ...msg, content: fullContent, isTyping: !data.done, hasThinking: !!fullThinkingContent, thinkingContent: fullThinkingContent || undefined, thinkingTokens, reasoningEffort, thoughtSignature }
                    : msg
                );

                if (data.done) { streamCompleted = true; clearStreamTimeout(); return true; }
              } catch (e) {
                console.warn('Failed to parse SSE data:', e);
              }
              return false;
            };

            const processBufferedLines = (rawBuffer: string): { shouldStop: boolean; remainder: string } => {
              const lines = rawBuffer.split('\n');
              const remainder = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                if (processStreamDataLine(line.slice(6).trim())) return { shouldStop: true, remainder: '' };
              }
              return { shouldStop: false, remainder };
            };

            restartStreamTimeout();
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                buffer += decoder.decode();
                if (buffer.trim()) {
                  for (const line of buffer.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    if (processStreamDataLine(line.slice(6).trim())) { clearStreamTimeout(); return; }
                  }
                }
                break;
              }
              lastChunkTime = Date.now();
              buffer += decoder.decode(value, { stream: true });
              const processed = processBufferedLines(buffer);
              buffer = processed.remainder;
              if (processed.shouldStop) { clearStreamTimeout(); return; }
              restartStreamTimeout();
            }
            clearStreamTimeout();

            if (streamTimedOut && !streamCompleted) {
              throw new Error(t('chat.streamTimeout', { defaultValue: 'Stream response timed out, please retry.' }));
            }
          } catch (streamError) {
            const errorMessage = streamError instanceof Error
              ? `${t('chat.sendError')}${streamError.message}`
              : `${t('chat.sendError')}${t('chat.unknownError')}`;
            const interruptedNotice = t('chat.partialResponseNotice', { defaultValue: '\n\n[Connection interrupted, response may be incomplete]' });
            const displayContent = fullContent
              ? (streamTimedOut ? `${fullContent}${interruptedNotice}` : fullContent)
              : errorMessage;

            const errorUpdater = (msg: any) =>
              msg.id === aiMessageId ? { ...msg, content: displayContent, isTyping: false } : msg;
            setCurrentConversation(prev => prev ? { ...prev, messages: prev.messages.map(errorUpdater) } : prev);
            setConversations(prev => prev.map(conv =>
              conv.id === conversation!.id ? { ...conv, messages: conv.messages.map(errorUpdater) } : conv
            ));
          } finally {
            try { reader.releaseLock(); } catch { /* ignore */ }
          }
        }
      } else {
        const data = await response.json();
        if (data.success) {
          const aiMsg = data.data?.aiMessage;
          const updater = (msg: any) =>
            msg.id === aiMessageId
              ? { ...msg, content: data.response, isTyping: false, hasThinking: aiMsg?.has_thinking || false, thinkingContent: aiMsg?.thinking_content, thinkingTokens: aiMsg?.thinking_tokens, reasoningEffort: aiMsg?.reasoning_effort, thoughtSignature: aiMsg?.thought_signature }
              : msg;
          setCurrentConversation(prev => prev ? { ...prev, messages: prev.messages.map(updater) } : prev);
          setConversations(prev => prev.map(conv =>
            conv.id === conversation!.id ? { ...conv, messages: conv.messages.map(updater) } : conv
          ));
          if (data.conversationId && !conversation.id) {
            setCurrentConversation(prev => prev ? { ...prev, id: data.conversationId } : prev);
          }
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      }
    } catch (error: unknown) {
      const errorMessage = `${t('chat.sendError')}${error instanceof Error ? error.message : t('chat.unknownError')}`;
      const errorUpdater = (msg: any) =>
        msg.id === aiMessageId ? { ...msg, content: errorMessage, isTyping: false } : msg;
      setCurrentConversation(prev => prev ? { ...prev, messages: prev.messages.map(errorUpdater) } : prev);
      setConversations(prev => prev.map(conv =>
        conv.id === conversation!.id ? { ...conv, messages: conv.messages.map(errorUpdater) } : conv
      ));
    } finally {
      setIsLoading(false);
      const finalUpdater = (msg: any) =>
        msg.id === aiMessageId ? { ...msg, isTyping: false } : msg;
      setCurrentConversation(prev => prev ? { ...prev, messages: prev.messages.map(finalUpdater) } : prev);
      setConversations(prev => prev.map(conv =>
        conv.id === conversation!.id ? { ...conv, messages: conv.messages.map(finalUpdater) } : conv
      ));
    }
  }, [inputMessage, isLoading, currentConversation, selectedModel, conversations, aiParameters, t, saveConversationsToStorage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const createNewConversation = useCallback(() => {
    setCurrentConversation(null);
    setInputMessage('');
    const url = new URL(window.location.href);
    url.searchParams.delete('conversation');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const clearAllConversations = useCallback(async () => {
    try {
      const conversationIds = conversations.map(conv => conv.id);
      for (const id of conversationIds) {
        await fetchWithAuth(`/api/chat/conversations/${id}`, { method: 'DELETE' });
      }
      setConversations([]);
      setCurrentConversation(null);
      saveConversationsToStorage([]);
      const url = new URL(window.location.href);
      url.searchParams.delete('conversation');
      window.history.replaceState({}, '', url.toString());
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw error;
    }
  }, [conversations, saveConversationsToStorage]);

  const formatTime = useCallback((date: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes });
    if (diffMinutes < 1440) return t('time.hoursAgo', { count: Math.floor(diffMinutes / 60) });
    return date.toLocaleDateString();
  }, [t]);

  const handleConversationSelect = useCallback(async (conversation: Conversation) => {
    const messages = await loadConversationMessages(conversation.id);
    const conversationWithMessages = { ...conversation, messages };
    setCurrentConversation(conversationWithMessages);
    const updatedConversations = conversations.map(conv =>
      conv.id === conversation.id ? conversationWithMessages : conv
    );
    setConversations(updatedConversations);
    saveConversationsToStorage(updatedConversations);
    const url = new URL(window.location.href);
    url.searchParams.set('conversation', conversation.id);
    window.history.replaceState({}, '', url.toString());
  }, [conversations, loadConversationMessages, saveConversationsToStorage]);

  return {
    conversations,
    currentConversation,
    inputMessage,
    setInputMessage,
    isLoading,
    selectedModel,
    aiParameters,
    setAiParameters,
    messagesEndRef,
    textareaRef,
    handleModelChange,
    handleSendMessage,
    handleKeyPress,
    createNewConversation,
    clearAllConversations,
    formatTime,
    handleConversationSelect,
  };
}
