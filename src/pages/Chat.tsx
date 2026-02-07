import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Sparkles } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AIParametersPanel from '../components/AIParametersPanel';
import ModelSelector from '../components/ModelSelector';
import ErrorBoundary from '../components/ErrorBoundary';
import ResponseApiIndicator from '../components/ResponseApiIndicator';
import { useTranslation } from 'react-i18next';
import { getUserId } from '../lib/user';
import {
  getValidatedModel,
  getValidatedConversations,
  setStorageItem
} from '../lib/storage';
import MessageBubble from '../components/MessageBubble';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isTyping?: boolean;
  useTypewriter?: boolean; // 是否使用打字机效果
  // Thinking chain fields
  hasThinking?: boolean;
  thinkingContent?: string;
  thinkingTokens?: number;
  reasoningEffort?: string;
  thoughtSignature?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: Date;
  provider?: string;
  model?: string;
}

interface ModelOption {
  provider: string;
  providerName: string;
  model: string;
  displayName: string;
}

interface AIParameters {
  temperature: number;
  maxTokens?: number;  // 可选参数，不设置时让模型自动判断输出长度
  topP: number;
  useResponsesAPI?: boolean;  // 是否使用 OpenAI Responses API
  researchTools?: {
    webSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
  };
  background?: boolean; // 是否使用后台模式（Research 模型推荐）
}

export default function Chat() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // const [typingMessage, setTypingMessage] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [aiParameters, setAiParameters] = useState<AIParameters>({
    temperature: 0.7,
    maxTokens: undefined,  // 默认不限制，让模型自动判断
    topP: 1.0,
    useResponsesAPI: false  // 默认不使用 Responses API
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleModelChange = (model: ModelOption) => {
    try {
      setSelectedModel(model);
      // 保存到localStorage with validation
      const result = setStorageItem('selectedModel', model);
      if (!result.success) {
        console.error('保存模型到localStorage失败:', result.error);
      }
    } catch (error) {
      console.error('模型选择失败:', error);
    }
  };

  useEffect(() => {
    // 先从localStorage加载，再尝试API
    loadConversationsFromStorage();
    // 从本地存储加载选中的模型
    loadSelectedModel();
    // 加载用户设置配置
    loadUserSettings().catch(console.error);
    // 延迟加载API数据，避免覆盖localStorage
    setTimeout(() => {
      loadConversations().catch(console.error);
    }, 1000);
  }, []);

  // 当conversations加载完成后，检查URL参数
  useEffect(() => {
    if (conversations.length > 0) {
      checkUrlParams();
    }
  }, [conversations]);

  // 检查URL参数并加载对应对话
  const checkUrlParams = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get('conversation');

    if (conversationId && conversations.length > 0) {
      try {
        // 从已加载的对话列表中找到对应的对话信息
        const conversation = conversations.find((conv: Conversation) => conv.id === conversationId);

        if (conversation) {
          setCurrentConversation(conversation);
        }
      } catch (error) {
        console.error('加载URL指定的对话失败:', error);
      }
    }
  };

  // 监听localStorage变化，同步模型选择和设置
  useEffect(() => {
    const handleStorageChange = () => {
      loadSelectedModel();
      loadUserSettings(); // 同时重新加载用户设置
      loadConversationsFromStorage(); // 同步conversations状态
    };

    // 监听storage事件（跨标签页）
    window.addEventListener('storage', handleStorageChange);

    // 监听自定义事件（同一页面内）
    window.addEventListener('localStorageChanged', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChanged', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation?.messages]);

  useEffect(() => {
    // 自动调整textarea高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  const loadSelectedModel = () => {
    const result = getValidatedModel('selectedModel');
    if (result.success && result.data) {
      setSelectedModel(result.data);
    } else if (result.error) {
      console.error('加载选中模型失败:', result.error);
    }
  };

  // 加载用户设置配置
  // 保存conversations到localStorage
  const saveConversationsToStorage = (conversations: Conversation[]) => {
    const result = setStorageItem('conversations', conversations);
    if (!result.success) {
      console.error('保存对话列表到localStorage失败:', result.error);
    }
  };

  // 从localStorage加载conversations
  const loadConversationsFromStorage = () => {
    const result = getValidatedConversations('conversations');

    if (result.success && result.data) {
      // 确保日期对象正确转换
      const conversations = result.data.map((conv: any) => ({
        ...conv,
        created_at: new Date(conv.created_at),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
      console.log('[DEBUG] 从localStorage加载的对话:', conversations);
      setConversations(conversations);
    } else if (result.error) {
      console.error('从localStorage加载对话列表失败:', result.error);
      // 不要设置空数组，保持当前状态
    } else {
      console.log('[DEBUG] localStorage中没有保存的对话');
    }
  };

  const loadUserSettings = async () => {
    try {
      const userId = getUserId();
      const response = await fetch(`/api/providers/config?userId=${encodeURIComponent(userId)}`);

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // 查找 OpenAI 提供商的配置
          const openaiConfig = result.data.find((config: any) => config.provider_name === 'openai');
          if (openaiConfig && openaiConfig.use_responses_api === 'true') {
            // 更新 aiParameters 以包含 useResponsesAPI
            setAiParameters(prev => ({
              ...prev,
              useResponsesAPI: true
            }));
            console.log('[DEBUG] 从用户设置中启用了 Responses API');
          }
        }
      }
    } catch (error) {
      console.error('加载用户设置失败:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const userId = getUserId();
      const response = await fetch(`/api/chat/conversations?userId=${userId}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
          // 确保日期对象正确转换
          const apiConversations = data.conversations.map((conv: any) => ({
            ...conv,
            created_at: new Date(conv.created_at)
          }));

          // 按创建时间倒序排列
          apiConversations.sort((a: any, b: any) => b.created_at.getTime() - a.created_at.getTime());

          console.log('[DEBUG] 从API获取到对话，更新状态:', apiConversations);
          setConversations(apiConversations);
          // 同步保存到localStorage
          saveConversationsToStorage(apiConversations);
        } else {
        }
      } else {
        console.warn('[DEBUG] API调用失败，保持当前状态');
      }
    } catch (error) {
      console.error('[DEBUG] API调用异常，保持当前状态:', error);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`);
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
      console.error('加载消息失败:', error);
      return [];
    }
  };


  // const simulateTyping = (text: string, callback: () => void) => {
  //   let index = 0;
  //   setTypingMessage('');
  //   
  //   const typeInterval = setInterval(() => {
  //     if (index < text.length) {
  //       setTypingMessage(text.slice(0, index + 1));
  //       index++;
  //     } else {
  //       clearInterval(typeInterval);
  //       setTypingMessage('');
  //       callback();
  //     }
  //   }, 30); // 打字速度
  // };

  const handleSendMessage = async () => {

    if (!inputMessage.trim() || isLoading) {
      console.log('[DEBUG] 提前返回，条件不满足');
      return;
    }


    setIsLoading(true);
    let conversation = currentConversation;

    // 如果没有当前对话，创建新对话
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

      // 保存新的对话列表
      saveConversationsToStorage(newConversations);
      setCurrentConversation(conversation);

      // 异步调用后端API创建对话（不阻塞UI）
      fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: conversation.id,
          title: conversation.title,
          userId: getUserId(),
          provider: conversation.provider,
          model: conversation.model
        })
      }).then(response => {
        if (response.ok) {
        } else {
          console.error('创建对话失败');
        }
      }).catch(error => {
        console.error('创建对话API调用失败:', error);
      });

      // 更新URL参数以反映新对话
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

    // 更新对话以反映最新的模型选择和新消息
    const updatedConversation = {
      ...conversation,
      provider: selectedModel?.provider || 'openai',
      model: selectedModel?.model || 'gpt-3.5-turbo',
      messages: [...conversation.messages, userMessage]
    };

    setCurrentConversation(updatedConversation);

    // 使用函数式更新来确保基于最新状态
    setConversations(prevConversations => {
      const newConversations = prevConversations.map(conv =>
        conv.id === conversation!.id ? updatedConversation : conv
      );
      // 保存更新后的对话列表
      saveConversationsToStorage(newConversations);
      return newConversations;
    });

    setInputMessage('');
    // 创建一个临时的AI消息用于显示流式内容
    const aiMessageId = self.crypto?.randomUUID?.() || Math.random().toString(36).substr(2, 9);
    const aiMessage: Message = {
      id: aiMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isTyping: true
    };

    // 立即添加空的AI消息到对话中
    const conversationWithAiMessage = {
      ...updatedConversation,
      messages: [...updatedConversation.messages, aiMessage]
    };
    setCurrentConversation(conversationWithAiMessage);

    // 使用函数式更新来确保基于最新状态
    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(conv =>
        conv.id === conversation!.id ? conversationWithAiMessage : conv
      );
      // 保存到localStorage
      saveConversationsToStorage(updatedConversations);
      return updatedConversations;
    });

    try {

      // 构建请求URL，使用流式响应获得真正的实时体验
      const url = new URL('/api/chat', window.location.origin);
      url.searchParams.set('stream', 'true');

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          provider: updatedConversation.provider,
          model: updatedConversation.model,
          conversationId: updatedConversation.id,
          userId: getUserId(),
          parameters: aiParameters
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '未知错误' }));
        throw new Error(`${t('chat.sendMessageError')}: ${errorData.error || response.statusText}`);
      }

      // 检查是否是流式响应
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        // 处理流式响应
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
              if (streamTimeout) {
                clearTimeout(streamTimeout);
                streamTimeout = null;
              }
            };

            const restartStreamTimeout = () => {
              clearStreamTimeout();
              streamTimeout = setTimeout(() => {
                if (Date.now() - lastChunkTime > STREAM_IDLE_TIMEOUT_MS) {
                  streamTimedOut = true;
                  console.warn('Stream idle timeout reached, cancelling reader');
                  void reader.cancel();
                  return;
                }
                restartStreamTimeout();
              }, STREAM_TIMEOUT_CHECK_INTERVAL_MS);
            };

            const applyMessageUpdate = (messageUpdater: (msg: any) => any) => {
              setCurrentConversation(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  messages: prev.messages.map(messageUpdater)
                };
              });

              setConversations(prev =>
                prev.map(conv => {
                  if (conv.id === conversation!.id) {
                    return {
                      ...conv,
                      messages: conv.messages.map(messageUpdater)
                    };
                  }
                  return conv;
                })
              );
            };

            const processStreamDataLine = (dataStr: string): boolean => {
              if (dataStr === '[DONE]') {
                streamCompleted = true;

                const finalUpdateMessage = (msg: any) =>
                  msg.id === aiMessageId
                    ? {
                      ...msg,
                      content: fullContent,
                      isTyping: false,
                      hasThinking: !!fullThinkingContent,
                      thinkingContent: fullThinkingContent || undefined,
                      thinkingTokens,
                      reasoningEffort,
                      thoughtSignature
                    }
                    : msg;

                applyMessageUpdate(finalUpdateMessage);
                clearStreamTimeout();
                return true;
              }

              try {
                const data = JSON.parse(dataStr);

                if (data.error) {
                  streamCompleted = true;
                  const errorMessage = `${t('chat.sendError')}${data.error}`;

                  const errorUpdateMessage = (msg: any) =>
                    msg.id === aiMessageId
                      ? { ...msg, content: errorMessage, isTyping: false }
                      : msg;

                  applyMessageUpdate(errorUpdateMessage);
                  clearStreamTimeout();
                  return true;
                }

                if (data.content !== undefined) {
                  fullContent += data.content;
                }
                if (data.thinking?.content) {
                  fullThinkingContent += data.thinking.content;
                }
                if (data.thinking?.tokens !== undefined) {
                  thinkingTokens = data.thinking.tokens;
                }
                if (data.thinking?.effort) {
                  reasoningEffort = data.thinking.effort;
                }
                if (data.thinking?.signature) {
                  thoughtSignature = data.thinking.signature;
                }

                const updateMessage = (msg: any) =>
                  msg.id === aiMessageId
                    ? {
                      ...msg,
                      content: fullContent,
                      isTyping: !data.done,
                      hasThinking: !!fullThinkingContent,
                      thinkingContent: fullThinkingContent || undefined,
                      thinkingTokens,
                      reasoningEffort,
                      thoughtSignature
                    }
                    : msg;

                applyMessageUpdate(updateMessage);

                if (data.done) {
                  streamCompleted = true;
                  clearStreamTimeout();
                  return true;
                }
              } catch (e) {
                console.warn('Failed to parse SSE data line:', e, 'raw data:', dataStr);
              }

              return false;
            };

            const processBufferedLines = (rawBuffer: string): { shouldStop: boolean; remainder: string } => {
              const lines = rawBuffer.split('\n');
              const remainder = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data: ')) {
                  continue;
                }

                const shouldStop = processStreamDataLine(line.slice(6).trim());
                if (shouldStop) {
                  return { shouldStop: true, remainder: '' };
                }
              }

              return { shouldStop: false, remainder };
            };

            restartStreamTimeout();

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                buffer += decoder.decode();

                if (buffer.trim()) {
                  const finalBatch = buffer.split('\n');
                  for (const line of finalBatch) {
                    if (!line.startsWith('data: ')) {
                      continue;
                    }
                    const shouldStop = processStreamDataLine(line.slice(6).trim());
                    if (shouldStop) {
                      clearStreamTimeout();
                      return;
                    }
                  }
                }
                break;
              }

              lastChunkTime = Date.now();
              buffer += decoder.decode(value, { stream: true });

              const processed = processBufferedLines(buffer);
              buffer = processed.remainder;

              if (processed.shouldStop) {
                clearStreamTimeout();
                return;
              }

              restartStreamTimeout();
            }

            clearStreamTimeout();

            if (streamTimedOut && !streamCompleted) {
              throw new Error(
                t('chat.streamTimeout', { defaultValue: '流式响应超时，请重试。' })
              );
            }
          } catch (streamError) {
            console.error('Stream response handling error:', streamError);
            const errorMessage = streamError instanceof Error ?
              `${t('chat.sendError')}${streamError.message}` :
              `${t('chat.sendError')}${t('chat.unknownError')}`;

            const interruptedNotice = t('chat.partialResponseNotice', {
              defaultValue: '\n\n[连接中断，回复可能不完整，请重试]'
            });
            const displayContent = fullContent
              ? (streamTimedOut ? `${fullContent}${interruptedNotice}` : fullContent)
              : errorMessage;

            const errorUpdateMessage = (msg: any) =>
              msg.id === aiMessageId
                ? { ...msg, content: displayContent, isTyping: false }
                : msg;

            setCurrentConversation(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                messages: prev.messages.map(errorUpdateMessage)
              };
            });

            setConversations(prev =>
              prev.map(conv => {
                if (conv.id === conversation!.id) {
                  return {
                    ...conv,
                    messages: conv.messages.map(errorUpdateMessage)
                  };
                }
                return conv;
              })
            );
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              console.warn('Failed to release stream reader lock', e);
            }
          }
        }
      } else {
        // 处理普通响应（兼容性）
        const data = await response.json();

        if (data.success) {
          // Extract thinking data from aiMessage (if存在)
          const aiMessage = data.data?.aiMessage;

          setCurrentConversation(prev => {
            if (!prev) return prev;
            const updatedMessages = prev.messages.map(msg =>
              msg.id === aiMessageId
                ? {
                  ...msg,
                  content: data.response,
                  isTyping: false,
                  hasThinking: aiMessage?.has_thinking || false,
                  thinkingContent: aiMessage?.thinking_content,
                  thinkingTokens: aiMessage?.thinking_tokens,
                  reasoningEffort: aiMessage?.reasoning_effort,
                  thoughtSignature: aiMessage?.thought_signature
                }
                : msg
            );
            return { ...prev, messages: updatedMessages };
          });

          setConversations(prev =>
            prev.map(conv => {
              if (conv.id === conversation!.id) {
                const updatedMessages = conv.messages.map(msg =>
                  msg.id === aiMessageId
                    ? {
                      ...msg,
                      content: data.response,
                      isTyping: false,
                      hasThinking: aiMessage?.has_thinking || false,
                      thinkingContent: aiMessage?.thinking_content,
                      thinkingTokens: aiMessage?.thinking_tokens,
                      reasoningEffort: aiMessage?.reasoning_effort,
                      thoughtSignature: aiMessage?.thought_signature
                    }
                    : msg
                );
                return { ...conv, messages: updatedMessages };
              }
              return conv;
            })
          );

          // 如果是新对话，更新conversationId
          if (data.conversationId && !conversation.id) {
            setCurrentConversation(prev => prev ? { ...prev, id: data.conversationId } : prev);
          }
        } else {
          throw new Error(data.error || '未知错误');
        }
      }
    } catch (error: unknown) {
      console.error('发送消息失败:', error);

      // 替换临时AI消息为错误消息，而不是添加新消息
      const errorMessage = `${t('chat.sendError')}${error instanceof Error ? error.message : t('chat.unknownError')}`;

      const updateMessageWithError = (msg: any) =>
        msg.id === aiMessageId
          ? { ...msg, content: errorMessage, isTyping: false }
          : msg;

      setCurrentConversation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map(updateMessageWithError)
        };
      });

      setConversations(prev =>
        prev.map(conv => {
          if (conv.id === conversation!.id) {
            return {
              ...conv,
              messages: conv.messages.map(updateMessageWithError)
            };
          }
          return conv;
        })
      );
    } finally {
      setIsLoading(false);
      // 确保AI消息的isTyping状态被清除
      setCurrentConversation(prev => {
        if (!prev) return prev;
        const updatedMessages = prev.messages.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, isTyping: false }
            : msg
        );
        return { ...prev, messages: updatedMessages };
      });

      setConversations(prev =>
        prev.map(conv => {
          if (conv.id === conversation!.id) {
            const updatedMessages = conv.messages.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, isTyping: false }
                : msg
            );
            return { ...conv, messages: updatedMessages };
          }
          return conv;
        })
      );
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const createNewConversation = () => {
    setCurrentConversation(null);
    setInputMessage('');

    // 清除URL参数，因为这是新对话
    const url = new URL(window.location.href);
    url.searchParams.delete('conversation');
    window.history.replaceState({}, '', url.toString());
  };

  // 清理历史记录 - 删除所有对话
  const clearAllConversations = async () => {
    if (confirm('确定要清除所有历史记录吗？此操作不可撤销。')) {
      try {
        // 获取所有对话ID
        const conversationIds = conversations.map(conv => conv.id);

        // 逐个删除对话（后端API）
        for (const id of conversationIds) {
          await fetch(`/api/chat/conversations/${id}`, {
            method: 'DELETE'
          });
        }

        // 清空前端状态
        setConversations([]);
        setCurrentConversation(null);
        saveConversationsToStorage([]);

        // 清除URL参数
        const url = new URL(window.location.href);
        url.searchParams.delete('conversation');
        window.history.replaceState({}, '', url.toString());

        console.log('已清除所有历史记录');
      } catch (error) {
        console.error('清除历史记录失败:', error);
        alert('清除历史记录失败，请稍后重试');
      }
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));

    if (diffMinutes < 60) {
      return t('time.minutesAgo', { count: diffMinutes });
    } else if (diffMinutes < 1440) {
      return t('time.hoursAgo', { count: Math.floor(diffMinutes / 60) });
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleConversationSelect = async (conversation: Conversation) => {
    const messages = await loadConversationMessages(conversation.id);
    const conversationWithMessages = { ...conversation, messages };
    setCurrentConversation(conversationWithMessages);

    // 更新conversations列表中的对话数据
    const updatedConversations = conversations.map(conv =>
      conv.id === conversation.id ? conversationWithMessages : conv
    );
    setConversations(updatedConversations);
    saveConversationsToStorage(updatedConversations);

    // 更新URL参数，这样刷新页面时能保持当前对话
    const url = new URL(window.location.href);
    url.searchParams.set('conversation', conversation.id);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 新的侧边栏组件 */}
      {showSidebar && (
        <Sidebar
          showSidebar={showSidebar}
          conversations={conversations}
          currentConversation={currentConversation}
          onNewConversation={createNewConversation}
          onConversationSelect={handleConversationSelect}
          onClearAllConversations={clearAllConversations}
          formatTime={formatTime}
        />
      )}


      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col">


        {/* 聊天头部 */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {currentConversation ? currentConversation.title : t('chat.startNewChat')}
                </h2>
                <div className="flex items-center space-x-2 mt-1">
                  {currentConversation?.provider && (
                    <p className="text-sm text-gray-500">
                      使用 {currentConversation.provider === 'openai' ? 'OpenAI' : currentConversation.provider} · {currentConversation.model}
                    </p>
                  )}
                  {/* Response API 状态指示器 */}
                  {selectedModel?.provider === 'openai' && aiParameters.useResponsesAPI && (
                    <ResponseApiIndicator
                      isActive={true}
                      isProcessing={isLoading}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* 模型选择器 */}
              <ErrorBoundary
                fallback={
                  <div className="text-sm text-red-500 px-3 py-2 border border-red-200 rounded-lg bg-red-50">
                    模型选择器加载失败
                  </div>
                }
              >
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={handleModelChange}
                  className="hidden sm:block"
                />
              </ErrorBoundary>
              {/* AI参数面板 */}
              <AIParametersPanel
                onParametersChange={setAiParameters}
                selectedModel={selectedModel}
                className="hidden sm:block"
              />
            </div>
          </div>

          {/* 移动端控制面板 */}
          <div className="mt-3 sm:hidden space-y-3">
            <ErrorBoundary
              fallback={
                <div className="text-sm text-red-500 px-3 py-2 border border-red-200 rounded-lg bg-red-50">
                  模型选择器加载失败
                </div>
              }
            >
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
              />
            </ErrorBoundary>
            {/* 移动端也使用可折叠的参数面板 */}
            <div className="relative">
              <AIParametersPanel
                onParametersChange={setAiParameters}
                selectedModel={selectedModel}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!currentConversation || currentConversation.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('chat.startNewChat')}</h3>
                <p className="text-gray-500 mb-6">{t('chat.startChatDescription')}</p>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="p-3 bg-gray-50 rounded-lg text-left">
                    <div className="font-medium text-gray-700 mb-1">💡 {t('chat.tip')}</div>
                    <div className="text-gray-600">{t('chat.askAnything')}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto">
              {currentConversation.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  useResponsesAPI={aiParameters.useResponsesAPI}
                />
              ))}

              {/* 打字效果 */}
              {/* {typingMessage && (
                <div className="flex justify-start">
                  <div className="flex flex-row max-w-[80%]">
                    <div className="flex-shrink-0 mr-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{typingMessage}</p>
                      <div className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-1"></div>
                    </div>
                  </div>
                </div>
              )} */}


              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 输入区域 */}
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end space-x-4">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t('chat.inputPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200 custom-scrollbar"
                  rows={1}
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
              </div>
              <button
                onClick={() => {
                  console.log('[DEBUG] 发送按钮被点击');
                  handleSendMessage();
                }}
                disabled={!inputMessage.trim() || (currentConversation?.messages.some(msg => msg.isTyping) ?? false)}
                className="px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              {t('chat.aiDisclaimer')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
