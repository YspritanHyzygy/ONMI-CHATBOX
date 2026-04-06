import React from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Conversation } from '@/hooks/useChat';

interface ChatInputProps {
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  currentConversation: Conversation | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function ChatInput({
  inputMessage,
  setInputMessage,
  onSend,
  onKeyDown,
  isLoading,
  currentConversation,
  textareaRef,
}: ChatInputProps) {
  const { t } = useTranslation();
  const isDisabled = !inputMessage.trim() || isLoading || (currentConversation?.messages.some(msg => msg.isTyping) ?? false);

  return (
    <div className="border-t border-border bg-background px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end rounded-2xl border border-border bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all">
          <textarea
            ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            className="flex-1 bg-transparent px-4 py-3 text-sm resize-none focus:outline-none placeholder:text-muted-foreground custom-scrollbar"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
          <div className="p-2">
            <Button
              onClick={onSend}
              disabled={isDisabled}
              size="icon"
              className="h-8 w-8 rounded-lg"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground text-center">
          {t('chat.aiDisclaimer')}
        </div>
      </div>
    </div>
  );
}
