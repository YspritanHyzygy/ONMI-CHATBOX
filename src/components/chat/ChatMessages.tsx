import { RefObject } from 'react';
import MessageBubble from '@/components/MessageBubble';
import ChatEmptyState from './ChatEmptyState';
import type { Message, Conversation } from '@/hooks/useChat';

interface ChatMessagesProps {
  currentConversation: Conversation | null;
  useResponsesAPI?: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSuggestionClick?: (text: string) => void;
}

export default function ChatMessages({
  currentConversation,
  useResponsesAPI,
  messagesEndRef,
  onSuggestionClick,
}: ChatMessagesProps) {
  if (!currentConversation || currentConversation.messages.length === 0) {
    return <ChatEmptyState onSuggestionClick={onSuggestionClick} />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      {currentConversation.messages.map((message: Message) => (
        <MessageBubble
          key={message.id}
          message={message}
          useResponsesAPI={useResponsesAPI}
        />
      ))}
      <div ref={messagesEndRef as React.RefObject<HTMLDivElement>} />
    </div>
  );
}
