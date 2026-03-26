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
  setStorageItem
} from '../lib/storage';
import { fetchWithAuth } from '../lib/fetch';
import MessageBubble from '../components/MessageBubble';
import { useConversations } from '../hooks/useConversations';
import { useChatStream } from '../hooks/useChatStream';

export interface Message {
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
  const {
    conversations,
    setConversations,
    currentConversation,
    setCurrentConversation,
    loadConversations,
    loadConversationsFromStorage,
    saveConversationsToStorage,
    handleConversationSelect,
    createNewConversation,
    clearAllConversations,
  } = useConversations();

  const [inputMessage, setInputMessage] = useState('');
  // const [typingMessage, setTypingMessage] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [aiParameters, setAiParameters] = useState<AIParameters>({
    temperature: 0.7,
    maxTokens: undefined,  // 默认不限制，让模型自动判断
    topP: 1.0,
    useResponsesAPI: false  // 默认不使用 Responses API
  });

  const { isLoading, handleSendMessage } = useChatStream({
    currentConversation,
    setCurrentConversation,
    conversations,
    setConversations,
    saveConversationsToStorage,
    selectedModel,
    aiParameters,
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
    const timerId = setTimeout(() => {
      loadConversations().catch(console.error);
    }, 1000);
    return () => clearTimeout(timerId);
  }, []);

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
  const loadUserSettings = async () => {
    try {
      const userId = getUserId();
      const response = await fetchWithAuth(`/api/providers/config?userId=${encodeURIComponent(userId)}`);

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

  const doSendMessage = () => {
    if (!inputMessage.trim()) return;
    const message = inputMessage;
    setInputMessage('');
    handleSendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSendMessage();
    }
  };

  const handleCreateNewConversation = () => {
    createNewConversation();
    setInputMessage('');
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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 新的侧边栏组件 */}
      {showSidebar && (
        <Sidebar
          showSidebar={showSidebar}
          conversations={conversations}
          currentConversation={currentConversation}
          onNewConversation={handleCreateNewConversation}
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
                  doSendMessage();
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
