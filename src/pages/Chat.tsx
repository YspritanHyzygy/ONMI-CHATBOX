import { useMemo, useState, type ComponentProps, type KeyboardEvent, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Copy,
  Database,
  Download,
  KeyRound,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useChat, type Conversation, type Message } from '@/hooks/useChat';
import AIParametersPanel from '@/components/AIParametersPanel';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ModelSelector from '@/components/ModelSelector';
import { ThinkingSection } from '@/components/ThinkingChain';
import { OnmiEmptyPanel, ProviderGlyph, StatusDot } from '@/components/onmi/OnmiPrimitives';
import { OnmiPageShell } from '@/components/onmi/OnmiShell';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { getProviderName } from '@/components/onmi/providerMeta';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { cn } from '@/lib/utils';
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar';
import useAuthStore from '@/store/authStore';

function useCopy() {
  return useOnmiCopy();
}

type AIParametersPanelProps = ComponentProps<typeof AIParametersPanel>;

export default function Chat() {
  const t = useCopy();
  const { showSidebar, setShowSidebar, closeSidebarOnNarrow } = useResponsiveSidebar();
  const [messageStyle, setMessageStyle] = useState<'doc' | 'bubble'>(() => {
    const saved = localStorage.getItem('onmi-message-style');
    return saved === 'bubble' ? 'bubble' : 'doc';
  });
  const chat = useChat();

  const provider = chat.selectedModel?.provider || chat.currentConversation?.provider || 'openai';
  const modelLabel = chat.selectedModel?.displayName || chat.currentConversation?.model || t('选择模型', 'Select model');
  const isStreaming = chat.isLoading || Boolean(chat.currentConversation?.messages.some((msg) => msg.isTyping));

  const handleConversationSelect = (conversation: Conversation) => {
    chat.handleConversationSelect(conversation);
    closeSidebarOnNarrow();
  };

  const handleNewConversation = () => {
    chat.createNewConversation();
    closeSidebarOnNarrow();
  };

  const toggleMessageStyle = () => {
    const next = messageStyle === 'doc' ? 'bubble' : 'doc';
    setMessageStyle(next);
    localStorage.setItem('onmi-message-style', next);
  };

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          status={isStreaming ? 'STREAMING' : 'CONNECTED'}
          settingsHref="/settings"
          accountLabel={t('设置', 'Settings')}
          onCommand={() => toast.info(t('命令面板是占位功能，后续会接入搜索与快捷操作。', 'Command palette is a placeholder for search and quick actions.'))}
          controls={
            <div className="onmi-top-controls">
              <ModelSelector
                selectedModel={chat.selectedModel}
                onModelChange={chat.handleModelChange}
                className="onmi-model-selector"
              />
            </div>
          }
        />
      }
      sidebar={
        <ChatSidebar
          conversations={chat.conversations}
          currentConversation={chat.currentConversation}
          onConversationSelect={handleConversationSelect}
          onNewConversation={handleNewConversation}
          onClearAllConversations={chat.clearAllConversations}
          formatTime={chat.formatTime}
        />
      }
    >
      <div className="onmi-chat">
        <ChatSessionHeader
          conversation={chat.currentConversation}
          modelLabel={modelLabel}
          provider={provider}
          isStreaming={isStreaming}
          messageStyle={messageStyle}
          onToggleMessageStyle={toggleMessageStyle}
        />

        <div className="onmi-transcript onmi-scroll">
          <ChatMessages
            currentConversation={chat.currentConversation}
            useResponsesAPI={chat.aiParameters.useResponsesAPI}
            messageStyle={messageStyle}
            onSuggestionClick={chat.setInputMessage}
            messagesEndRef={chat.messagesEndRef}
          />
        </div>

        <ChatComposer
          inputMessage={chat.inputMessage}
          setInputMessage={chat.setInputMessage}
          onSend={chat.handleSendMessage}
          onKeyDown={chat.handleKeyPress}
          isLoading={chat.isLoading}
          currentConversation={chat.currentConversation}
          textareaRef={chat.textareaRef}
          temperature={chat.aiParameters.temperature}
          selectedModel={chat.selectedModel}
          onParametersChange={chat.setAiParameters}
        />
      </div>
    </OnmiPageShell>
  );
}

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onConversationSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onClearAllConversations?: () => void;
  formatTime: (date: Date) => string;
}

function ChatSidebar({
  conversations,
  currentConversation,
  onConversationSelect,
  onNewConversation,
  onClearAllConversations,
  formatTime,
}: ChatSidebarProps) {
  const t = useCopy();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const initials = getInitials(user?.displayName || user?.username || 'YS');

  const clearAll = () => {
    if (!onClearAllConversations || conversations.length === 0) return;
    const ok = window.confirm(t('清空全部会话？此操作不可撤销。', 'Clear all sessions? This cannot be undone.'));
    if (ok) {
      onClearAllConversations();
    }
  };

  return (
    <div className="onmi-sidebar">
      <div className="onmi-chat-sidebar-new">
        <button type="button" className="onmi-btn" onClick={onNewConversation}>
          <Plus size={13} />
          <span>{t('新建会话', 'New session')}</span>
          <kbd>Ctrl</kbd>
          <kbd>N</kbd>
        </button>
      </div>

      <div className="onmi-session-table-head">
        <span>PID</span>
        <span>SESSION</span>
        <span>MSG</span>
        <button type="button" onClick={clearAll} title={t('清空会话', 'Clear sessions')}>
          <Trash2 size={11} />
        </button>
      </div>

      <div className="onmi-session-list onmi-scroll">
        {conversations.length === 0 ? (
          <div className="onmi-session-empty">
            <MessageSquare size={22} />
            <span>{t('暂无会话记录', 'No sessions yet')}</span>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            const active = currentConversation?.id === conversation.id;
            return (
              <button
                type="button"
                key={conversation.id}
                className={cn('onmi-session-row', active && 'active')}
                onClick={() => onConversationSelect(conversation)}
              >
                <span className="onmi-mono onmi-session-pid">{String(index).padStart(2, '0')}</span>
                <span className="onmi-session-main">
                  <span>
                    <StatusDot state={active ? 'live' : 'off'} />
                    <b>{conversation.title || t('未命名会话', 'Untitled session')}</b>
                  </span>
                  <small className="onmi-mono">
                    {(conversation.provider || 'openai').toUpperCase()} · {formatTime(conversation.created_at)}
                  </small>
                </span>
                <span className="onmi-mono onmi-session-count">{conversation.messages?.length || 0}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="onmi-sidebar-footer">
        <Link to="/settings" className="onmi-nav-item">
          <KeyRound size={14} />
          <span>{t('API 凭证', 'API credentials')}</span>
        </Link>
        <Link to="/data" className="onmi-nav-item">
          <Database size={14} />
          <span>{t('数据 · I/O', 'Data · I/O')}</span>
        </Link>
        <Link to="/usage" className="onmi-nav-item">
          <Activity size={14} />
          <span>{t('本地用量', 'Local usage')}</span>
          <b>EST</b>
        </Link>
        <div className="onmi-user-strip">
          <div className="onmi-user-avatar onmi-mono">{initials}</div>
          <div>
            <strong>{user?.displayName || user?.username || 'yspritan'}</strong>
            <span className="onmi-mono">localhost:5173 · v0.4.2</span>
          </div>
          <button type="button" className="onmi-icon-button" onClick={logout} title={t('退出', 'Log out')}>
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatSessionHeaderProps {
  conversation: Conversation | null;
  provider: string;
  modelLabel: string;
  isStreaming: boolean;
  messageStyle: 'doc' | 'bubble';
  onToggleMessageStyle: () => void;
}

function ChatSessionHeader({
  conversation,
  provider,
  modelLabel,
  isStreaming,
  messageStyle,
  onToggleMessageStyle,
}: ChatSessionHeaderProps) {
  const t = useCopy();
  const messageCount = conversation?.messages.length || 0;
  const tokenEstimate = useMemo(() => {
    const chars = conversation?.messages.reduce((sum, msg) => sum + String(msg.content || '').length, 0) || 0;
    return Math.max(0, Math.round(chars / 4));
  }, [conversation?.messages]);

  return (
    <section className="onmi-chat-header">
      <div className="onmi-chat-title">
        <div>
          <span className="onmi-section-label">SESS · {conversation ? conversation.id.slice(0, 4).toUpperCase() : 'NEW'}</span>
          <h1>{conversation?.title || t('新的 ONMI 会话', 'New ONMI session')}</h1>
          <p className="onmi-mono">
            {messageCount} messages · context {tokenEstimate.toLocaleString()} tok · provider {getProviderName(provider)} · {modelLabel} · {isStreaming ? 'streaming' : 'ready'}
          </p>
        </div>
      </div>
      <div className="onmi-chat-actions">
        <button type="button" className="onmi-btn ghost" onClick={onToggleMessageStyle}>
          <SlidersHorizontal size={12} />
          {messageStyle === 'doc' ? t('文档流', 'Document') : t('气泡', 'Bubble')}
        </button>
        <button type="button" className="onmi-btn ghost" onClick={() => toast.info(t('导出当前会话是占位功能。', 'Current-session export is a placeholder.'))}>
          <Download size={12} />
        </button>
        <button type="button" className="onmi-btn ghost" onClick={() => toast.info(t('会话分叉是占位功能。', 'Session fork is a placeholder.'))}>
          <RefreshCw size={12} />
        </button>
      </div>
    </section>
  );
}

interface ChatMessagesProps {
  currentConversation: Conversation | null;
  useResponsesAPI?: boolean;
  messageStyle: 'doc' | 'bubble';
  onSuggestionClick: (text: string) => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

function ChatMessages({
  currentConversation,
  useResponsesAPI,
  messageStyle,
  onSuggestionClick,
  messagesEndRef,
}: ChatMessagesProps) {
  const t = useCopy();
  const user = useAuthStore((state) => state.user);
  const initials = getInitials(user?.displayName || user?.username || 'YS');

  if (!currentConversation || currentConversation.messages.length === 0) {
    const suggestions = [
      t('帮我审计这段 OAuth 回调，重点看 state 校验和 PKCE。', 'Audit this OAuth callback, focusing on state and PKCE.'),
      t('把这段产品需求拆成可执行任务。', 'Break this product request into executable tasks.'),
      t('解释一下这个错误日志可能的原因。', 'Explain the likely cause of this error log.'),
    ];
    return (
      <OnmiEmptyPanel
        title={t('一个控制台。所有模型。你的密钥。', 'One console. Every model. Your keys.')}
        description={t(
          '选择一个模型，输入问题，ONMI 会保留当前项目的真实流式对话能力。',
          'Choose a model and ask anything. ONMI keeps the real streaming chat flow wired in.'
        )}
      >
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" className="onmi-btn" onClick={() => onSuggestionClick(suggestion)}>
            <Sparkles size={12} />
            {suggestion}
          </button>
        ))}
      </OnmiEmptyPanel>
    );
  }

  return (
    <div className={cn('onmi-message-stack', messageStyle === 'bubble' && 'bubble-mode')}>
      {currentConversation.messages.map((message, index) => (
        <OnmiMessage
          key={message.id}
          message={message}
          index={index}
          conversation={currentConversation}
          useResponsesAPI={useResponsesAPI}
          initials={initials}
          bubble={messageStyle === 'bubble'}
        />
      ))}
      <div ref={messagesEndRef as RefObject<HTMLDivElement>} />
    </div>
  );
}

interface OnmiMessageProps {
  message: Message;
  index: number;
  conversation: Conversation;
  useResponsesAPI?: boolean;
  initials: string;
  bubble: boolean;
}

function OnmiMessage({ message, index, conversation, useResponsesAPI, initials, bubble }: OnmiMessageProps) {
  const t = useCopy();
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  const provider = conversation.provider || 'openai';
  const model = conversation.model || getProviderName(provider);

  const copyMessage = async () => {
    await navigator.clipboard.writeText(content);
    toast.success(t('已复制消息', 'Message copied'));
  };

  return (
    <article className={cn('onmi-message', isUser && 'user', bubble && 'bubble')}>
      {!bubble && (
        <div className="onmi-message-gutter">
          <span className="onmi-mono">{String(index).padStart(2, '0')}</span>
          {isUser ? <span className="onmi-message-avatar onmi-mono">{initials}</span> : <ProviderGlyph provider={provider} size={24} />}
          {!isUser && message.isTyping && <span className="onmi-mono onmi-mini-live">LIVE</span>}
        </div>
      )}
      <div className="onmi-message-body">
        <div className="onmi-message-meta onmi-mono">
          <span>{isUser ? 'USER · YOU' : `ASST · ${model.toUpperCase()}`}</span>
          <span>{formatTime(message.timestamp)}</span>
          {message.isTyping && <span>{useResponsesAPI ? 'RESPONSES API' : 'STREAMING'}</span>}
        </div>

        {message.role === 'assistant' ? (
          <>
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
            {content ? (
              <MarkdownRenderer content={content} className="onmi-markdown" />
            ) : (
              <div className="onmi-loading-line">
                <span className="onmi-caret" />
                <span className="onmi-mono">{t('等待模型输出…', 'Waiting for model output...')}</span>
              </div>
            )}
            {message.isTyping && content && <span className="onmi-caret" />}
          </>
        ) : (
          <p className="onmi-user-text">{content}</p>
        )}

        {!message.isTyping && !isUser && (
          <div className="onmi-message-actions">
            <button type="button" className="onmi-btn ghost" onClick={copyMessage}>
              <Copy size={11} />
              {t('复制', 'Copy')}
            </button>
            <button type="button" className="onmi-btn ghost" onClick={() => toast.info(t('重生成是占位功能。', 'Retry is a placeholder.'))}>
              <RefreshCw size={11} />
              {t('重生成', 'Retry')}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

interface ChatComposerProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  onSend: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  isLoading: boolean;
  currentConversation: Conversation | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  temperature: number;
  selectedModel: AIParametersPanelProps['selectedModel'];
  onParametersChange: AIParametersPanelProps['onParametersChange'];
}

function ChatComposer({
  inputMessage,
  setInputMessage,
  onSend,
  onKeyDown,
  isLoading,
  currentConversation,
  textareaRef,
  temperature,
  selectedModel,
  onParametersChange,
}: ChatComposerProps) {
  const t = useCopy();
  const isDisabled = !inputMessage.trim() || isLoading || (currentConversation?.messages.some((message) => message.isTyping) ?? false);

  return (
    <section className="onmi-composer brk">
      <textarea
        ref={textareaRef as RefObject<HTMLTextAreaElement>}
        value={inputMessage}
        onChange={(event) => setInputMessage(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={t('继续追问，或按 / 切换提示词模板…', 'Ask anything, or press / for prompt templates...')}
        className="onmi-composer-input onmi-scroll"
      />
      <div className="onmi-composer-toolbar">
        <button
          type="button"
          className="onmi-btn ghost onmi-tool-button"
          title={t('附件', 'Attach')}
          onClick={() => toast.info(t('附件功能暂未接入。', 'Attachments are not wired yet.'))}
        >
          <Plus size={12} />
          <span className="onmi-toolbar-label">{t('附件', 'Attach')}</span>
        </button>
        <button
          type="button"
          className="onmi-btn ghost onmi-tool-button"
          title={t('工具', 'Tools')}
          onClick={() => toast.info(t('工具调用面板是占位功能。', 'Tools panel is a placeholder.'))}
        >
          <Wand2 size={12} />
          <span className="onmi-toolbar-label">{t('工具', 'Tools')}</span>
        </button>
        <div className="onmi-composer-param-control" title={t('参数', 'Params')}>
          <AIParametersPanel
            onParametersChange={onParametersChange}
            selectedModel={selectedModel}
            className="onmi-params-trigger onmi-composer-params-trigger"
          />
          <span className="onmi-mono onmi-composer-param-temp">T {temperature.toFixed(1)}</span>
        </div>
        <div className="onmi-composer-spacer" />
        <span className="onmi-mono onmi-composer-count">{inputMessage.length} / 8,192</span>
        <button type="button" className="onmi-btn primary" disabled={isDisabled} onClick={onSend}>
          <Send size={12} />
          <span className="onmi-send-label">{isLoading ? t('发送中', 'Sending') : t('发送', 'Send')}</span>
          <kbd>Enter</kbd>
        </button>
      </div>
    </section>
  );
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return 'YS';
  return cleaned.slice(0, 2).toUpperCase();
}
