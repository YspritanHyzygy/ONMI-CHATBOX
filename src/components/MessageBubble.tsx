import { User, Bot } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const isUser = message.role === 'user';

  return (
    <div className={`group py-4 px-0 ${isUser ? 'bg-muted/30' : ''}`}>
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}>
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {isUser ? t('chat.you', { defaultValue: 'You' }) : t('chat.assistant', { defaultValue: 'Assistant' })}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.isTyping && !message.thinkingContent && (
              <span className="text-[10px] font-medium text-primary">
                {useResponsesAPI ? t('chat.responsesApiProcessing') : t('chat.thinking')}
              </span>
            )}
          </div>

          {message.role === 'assistant' ? (
            <div>
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

              <MarkdownRenderer
                content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                className="text-sm leading-relaxed"
              />

              {message.isTyping && message.content && (
                <span className="inline-flex items-center ml-1">
                  <span className="w-1.5 h-4 bg-primary animate-pulse rounded-full" />
                </span>
              )}

              {message.isTyping && !message.content && !message.thinkingContent && (
                <LoadingIndicator
                  useResponsesAPI={useResponsesAPI}
                  isStreaming={!useResponsesAPI}
                  className="py-1"
                />
              )}
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
