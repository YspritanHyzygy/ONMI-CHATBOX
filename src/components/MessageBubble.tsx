import { User, Bot } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import LoadingIndicator from './LoadingIndicator';
import { ThinkingSection } from './ThinkingChain';
import { useTranslation } from 'react-i18next';

interface Message {
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

interface MessageBubbleProps {
    message: Message;
    useResponsesAPI?: boolean;
}

export default function MessageBubble({ message, useResponsesAPI = false }: MessageBubbleProps) {
    const { t } = useTranslation();

    return (
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}>
                <div className={`flex-shrink-0 ${message.role === 'user' ? 'ml-3' : 'mr-3'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${message.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                        }`}>
                        {message.role === 'user' ? (
                            <User className="w-4 h-4" />
                        ) : (
                            <Bot className="w-4 h-4" />
                        )}
                    </div>
                </div>

                <div className={`px-4 py-3 rounded-2xl ${message.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-900 shadow-sm'
                    }`}>
                    {message.role === 'assistant' ? (
                        <div className={message.isTyping ? 'relative' : ''}>
                            {/* Thinking Section - 显示在内容之前 */}
                            {message.hasThinking && (
                                <ThinkingSection
                                    content={message.thinkingContent}
                                    tokens={message.thinkingTokens}
                                    effort={message.reasoningEffort}
                                    signature={message.thoughtSignature}
                                    isStreaming={message.isTyping}
                                    className="mb-3"
                                />
                            )}

                            {/* Main Content */}
                            <MarkdownRenderer
                                content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                                className="text-sm leading-relaxed"
                            />

                            {/* Typing indicator for content */}
                            {message.isTyping && message.content && (
                                <div className="inline-flex items-center ml-1">
                                    <div className="w-1 h-4 bg-blue-500 animate-pulse rounded-full"></div>
                                </div>
                            )}

                            {/* Loading indicator when no content yet */}
                            {message.isTyping && !message.content && !message.thinkingContent && (
                                <LoadingIndicator
                                    useResponsesAPI={useResponsesAPI}
                                    isStreaming={!useResponsesAPI}
                                    className="py-2"
                                />
                            )}
                        </div>
                    ) : (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                            {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                        </p>
                    )}

                    <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {message.isTyping && !message.thinkingContent && (
                            <span className={`ml-2 font-medium ${useResponsesAPI ? 'text-purple-500' : 'text-blue-500'
                                }`}>
                                {useResponsesAPI
                                    ? t('chat.responsesApiProcessing')
                                    : t('chat.thinking')
                                }
                            </span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
