import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUserId } from '../lib/user';
import { fetchWithAuth } from '../lib/fetch';
import type { Message, Conversation, AIParameters, ModelOption } from '../pages/Chat';

interface UseChatStreamParams {
  currentConversation: Conversation | null;
  setCurrentConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  saveConversationsToStorage: (conversations: Conversation[]) => void;
  selectedModel: ModelOption | null;
  aiParameters: AIParameters;
}

export function useChatStream({
  currentConversation,
  setCurrentConversation,
  conversations,
  setConversations,
  saveConversationsToStorage,
  selectedModel,
  aiParameters,
}: UseChatStreamParams) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (inputMessage: string) => {

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
      fetchWithAuth('/api/chat/conversations', {
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
        if (!response.ok) {
          console.error('创建对话失败，状态码:', response.status);
        }
      }).catch(error => {
        console.error('创建对话API调用失败:', error);
        // 对话创建失败时不阻塞用户，但后续消息发送时后端会自动创建对话
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

      const response = await fetchWithAuth(url.toString(), {
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

  return { isLoading, handleSendMessage };
}
