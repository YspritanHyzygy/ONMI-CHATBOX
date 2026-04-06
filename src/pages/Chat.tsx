import { useState } from 'react';
import { useChat } from '@/hooks/useChat';
import AppSidebar from '@/components/sidebar/AppSidebar';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatInput from '@/components/chat/ChatInput';
import { cn } from '@/lib/utils';

export default function Chat() {
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  const chat = useChat();

  return (
    <div className="h-screen relative bg-background overflow-hidden">
      {/* Mobile backdrop — only visible on small screens when sidebar is open */}
      {showSidebar && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30 animate-in fade-in duration-200"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar — fixed positioning, slides via translateX (same animation desktop + mobile) */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-72 z-40',
          'transform transition-transform duration-300 ease-in-out',
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <AppSidebar
          conversations={chat.conversations}
          currentConversation={chat.currentConversation}
          onNewConversation={chat.createNewConversation}
          onConversationSelect={chat.handleConversationSelect}
          onClearAllConversations={chat.clearAllConversations}
          formatTime={chat.formatTime}
        />
      </aside>

      {/* Main content — shifts right on desktop when sidebar is open */}
      <div
        className={cn(
          'h-full flex flex-col min-w-0',
          'transition-[margin-left] duration-300 ease-in-out',
          showSidebar ? 'md:ml-72' : 'ml-0'
        )}
      >
        <ChatHeader
          showSidebar={showSidebar}
          setShowSidebar={setShowSidebar}
          currentConversation={chat.currentConversation}
          selectedModel={chat.selectedModel}
          aiParameters={chat.aiParameters}
          isLoading={chat.isLoading}
          onModelChange={chat.handleModelChange}
          onParametersChange={chat.setAiParameters}
        />

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <ChatMessages
            currentConversation={chat.currentConversation}
            useResponsesAPI={chat.aiParameters.useResponsesAPI}
            messagesEndRef={chat.messagesEndRef}
            onSuggestionClick={(text) => chat.setInputMessage(text)}
          />
        </div>

        <ChatInput
          inputMessage={chat.inputMessage}
          setInputMessage={chat.setInputMessage}
          onSend={chat.handleSendMessage}
          onKeyDown={chat.handleKeyPress}
          isLoading={chat.isLoading}
          currentConversation={chat.currentConversation}
          textareaRef={chat.textareaRef}
        />
      </div>
    </div>
  );
}
