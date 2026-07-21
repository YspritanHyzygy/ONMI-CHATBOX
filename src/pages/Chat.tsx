import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Copy,
  Database,
  Download,
  KeyRound,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
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

const PROMPT_TEMPLATES = [
  {
    label: 'Debug a failure',
    text: 'Please debug this failure. Start with the likely root cause, then give a minimal fix and a verification checklist:\n\n',
  },
  {
    label: 'Review code',
    text: 'Please review this code for correctness, regressions, security issues, and missing tests. Lead with findings:\n\n',
  },
  {
    label: 'Plan implementation',
    text: 'Turn this request into an implementation plan with success criteria, edge cases, and a focused test plan:\n\n',
  },
  {
    label: 'Summarize session',
    text: 'Summarize the current session into decisions, open questions, and next actions.',
  },
];

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
  const selectConversation = chat.handleConversationSelect;
  const startNewConversation = chat.createNewConversation;

  const provider = chat.selectedModel?.provider || chat.currentConversation?.provider || '';
  const modelLabel = chat.selectedModel?.displayName || chat.currentConversation?.model || t('选择模型', 'Select model');
  const isStreaming = chat.isLoading || Boolean(chat.currentConversation?.messages.some((msg) => msg.isTyping));

  const handleConversationSelect = useCallback((conversation: Conversation) => {
    void selectConversation(conversation);
    closeSidebarOnNarrow();
  }, [closeSidebarOnNarrow, selectConversation]);

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    closeSidebarOnNarrow();
  }, [closeSidebarOnNarrow, startNewConversation]);

  const openTemplates = useCallback(() => {
    window.dispatchEvent(new Event('chat:open-templates'));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const commandKey = event.ctrlKey || event.metaKey;
      if (commandKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleNewConversation();
      } else if (commandKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openTemplates();
      } else if (event.key === 'Escape') {
        setShowSidebar(false);
        window.dispatchEvent(new Event('chat:close-overlays'));
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleNewConversation, openTemplates, setShowSidebar]);

  const toggleMessageStyle = () => {
    const next = messageStyle === 'doc' ? 'bubble' : 'doc';
    setMessageStyle(next);
    localStorage.setItem('onmi-message-style', next);
  };

  const handleExportCurrent = () => {
    if (!chat.currentConversation || chat.currentConversation.messages.length === 0) {
      toast.error(t('没有可导出的会话', 'No session to export.'));
      return;
    }

    downloadTextFile(
      `${sanitizeFilename(chat.currentConversation.title || 'onmi-session')}.md`,
      buildTranscriptMarkdown(chat.currentConversation)
    );
    toast.success(t('会话已导出', 'Session exported'));
  };

  const handleForkCurrent = async () => {
    try {
      const forked = await chat.forkCurrentConversation();
      toast.success(`${t('会话已分叉', 'Session forked')}: ${forked.title}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('会话分叉失败', 'Session fork failed'));
    }
  };

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          settingsHref="/settings"
          accountLabel={t('设置', 'Settings')}
          commandLabel={t('提示词模板', 'Templates')}
          onCommand={openTemplates}
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
          onRenameConversation={chat.renameConversation}
          onDeleteConversation={chat.deleteConversation}
          loadState={chat.conversationsState}
          loadError={chat.conversationsError}
          onRetry={chat.retryConversations}
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
          onExportCurrent={handleExportCurrent}
          onForkCurrent={handleForkCurrent}
        />

        <div className="onmi-transcript onmi-scroll">
          <ChatMessages
            currentConversation={chat.currentConversation}
            useResponsesAPI={chat.aiParameters.useResponsesAPI}
            messageStyle={messageStyle}
            onSuggestionClick={chat.setInputMessage}
            messagesEndRef={chat.messagesEndRef}
            isLoading={chat.isConversationLoading}
            loadError={chat.conversationLoadError}
            onRetry={chat.retryCurrentConversation}
            onRegenerate={chat.regenerateLastMessage}
            onEditMessage={(content) => {
              chat.setInputMessage(content);
              chat.textareaRef.current?.focus();
            }}
            canRegenerate={!chat.isLoading && chat.providerReady && chat.currentConversation?.persisted !== false}
          />
        </div>

        {!chat.providerReady && (
          <div className="onmi-provider-onboarding" role="status">
            <KeyRound size={14} />
            <span>
              {chat.providerConfigState === 'loading'
                ? t('正在验证 Provider 配置...', 'Checking provider configuration...')
                : chat.providerConfigState === 'error'
                  ? (chat.providerConfigError || t('无法验证 Provider 配置。', 'Could not verify provider configuration.'))
                  : chat.selectedModel
                    ? t('所选 Provider 尚未配置可用凭证。', 'The selected provider does not have usable credentials yet.')
                    : t('请先配置并选择一个 Provider 模型后再发送消息。', 'Configure a provider and choose a model before sending a message.')}
            </span>
            <Link to="/settings">{t('打开 API 设置', 'Open API settings')}</Link>
          </div>
        )}

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
          onStop={chat.stopGeneration}
          onTemplateSelect={chat.setInputMessage}
          providerReady={chat.providerReady}
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
  onClearAllConversations: () => Promise<void>;
  onRenameConversation: (conversationId: string, title: string) => Promise<void>;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  loadState: 'loading' | 'ready' | 'error';
  loadError: string | null;
  onRetry: () => Promise<void>;
  formatTime: (date: Date) => string;
}

function ChatSidebar({
  conversations,
  currentConversation,
  onConversationSelect,
  onNewConversation,
  onClearAllConversations,
  onRenameConversation,
  onDeleteConversation,
  loadState,
  loadError,
  onRetry,
  formatTime,
}: ChatSidebarProps) {
  const t = useCopy();
  const user = useAuthStore((state) => state.user);
  const logoutUser = useAuthStore((state) => state.logoutUser);
  const initials = getInitials(user?.displayName || user?.username || 'YS');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const [isClearing, setIsClearing] = useState(false);
  const visibleConversations = useMemo(() => (
    deferredSearchQuery
      ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(deferredSearchQuery))
      : conversations
  ), [conversations, deferredSearchQuery]);

  const clearAll = async () => {
    if (conversations.length === 0 || isClearing) return;
    const ok = window.confirm(t('清空全部会话？此操作不可撤销。', 'Clear all sessions? This cannot be undone.'));
    if (!ok) return;
    setIsClearing(true);
    try {
      await onClearAllConversations();
      toast.success(t('全部会话已清空', 'All sessions cleared'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('清空会话失败', 'Failed to clear sessions'));
    } finally {
      setIsClearing(false);
    }
  };

  const rename = async (conversation: Conversation) => {
    const title = window.prompt(
      t('输入新的会话标题（最多 120 个字符）', 'Enter a new session title (120 characters max)'),
      conversation.title,
    );
    if (title === null || title.trim() === conversation.title) return;
    try {
      await onRenameConversation(conversation.id, title);
      toast.success(t('会话已重命名', 'Session renamed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('重命名失败', 'Rename failed'));
    }
  };

  const remove = async (conversation: Conversation) => {
    if (!window.confirm(t('删除这个会话？此操作不可撤销。', 'Delete this session? This cannot be undone.'))) return;
    try {
      await onDeleteConversation(conversation.id);
      toast.success(t('会话已删除', 'Session deleted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('删除失败', 'Delete failed'));
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

      <label className="onmi-session-search">
        <Search size={12} />
        <span className="sr-only">{t('搜索会话', 'Search sessions')}</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('搜索会话...', 'Search sessions...')}
        />
      </label>

      <div className="onmi-session-table-head">
        <span>PID</span>
        <span>SESSION</span>
        <span>MSG</span>
        <button type="button" onClick={() => void clearAll()} disabled={isClearing || conversations.length === 0} title={t('清空会话', 'Clear sessions')}>
          <Trash2 size={11} />
        </button>
      </div>

      <div className="onmi-session-list onmi-scroll">
        {loadState === 'loading' && conversations.length === 0 ? (
          <div className="onmi-session-empty" role="status">
            <RefreshCw size={18} className="animate-spin" />
            <span>{t('正在加载会话...', 'Loading sessions...')}</span>
          </div>
        ) : loadState === 'error' ? (
          <div className="onmi-session-empty onmi-session-error" role="alert">
            <AlertTriangle size={20} />
            <span>{loadError || t('会话加载失败', 'Failed to load sessions')}</span>
            <button type="button" className="onmi-btn ghost" onClick={() => void onRetry()}>
              <RefreshCw size={11} /> {t('重试', 'Retry')}
            </button>
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="onmi-session-empty">
            <MessageSquare size={22} />
            <span>{searchQuery ? t('没有匹配的会话', 'No matching sessions') : t('暂无会话记录', 'No sessions yet')}</span>
          </div>
        ) : (
          visibleConversations.map((conversation, index) => {
            const active = currentConversation?.id === conversation.id;
            return (
              <div key={conversation.id} className={cn('onmi-session-row', active && 'active')}>
                <button type="button" className="onmi-session-select" onClick={() => onConversationSelect(conversation)}>
                  <span className="onmi-mono onmi-session-pid">{String(index).padStart(2, '0')}</span>
                  <span className="onmi-session-main">
                    <span>
                      <StatusDot state={active ? 'ok' : 'off'} />
                      <b>{conversation.title || t('未命名会话', 'Untitled session')}</b>
                    </span>
                    <small className="onmi-mono">
                      {(conversation.provider || t('未知', 'unknown')).toUpperCase()} · {formatTime(conversation.created_at)}
                    </small>
                  </span>
                  <span className="onmi-mono onmi-session-count">{conversation.messages?.length || 0}</span>
                </button>
                <span className="onmi-session-actions">
                  <button type="button" onClick={() => void rename(conversation)} title={t('重命名', 'Rename')} aria-label={t('重命名会话', 'Rename session')}>
                    <Pencil size={11} />
                  </button>
                  <button type="button" onClick={() => void remove(conversation)} title={t('删除', 'Delete')} aria-label={t('删除会话', 'Delete session')}>
                    <Trash2 size={11} />
                  </button>
                </span>
              </div>
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
            <span className="onmi-mono">{t('本地服务 · 自托管', 'local server · self-hosted')}</span>
          </div>
          <button type="button" className="onmi-icon-button" onClick={() => void logoutUser()} title={t('退出', 'Log out')} aria-label={t('退出', 'Log out')}>
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
  onExportCurrent: () => void;
  onForkCurrent: () => void;
}

function ChatSessionHeader({
  conversation,
  provider,
  modelLabel,
  isStreaming,
  messageStyle,
  onToggleMessageStyle,
  onExportCurrent,
  onForkCurrent,
}: ChatSessionHeaderProps) {
  const t = useCopy();
  const messageCount = conversation?.messages.length || 0;
  const providerLabel = provider ? getProviderName(provider) : t('未选择', 'not selected');
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
            {messageCount} messages · context {tokenEstimate.toLocaleString()} tok · provider {providerLabel} · {modelLabel} · {isStreaming ? 'streaming' : 'ready'}
          </p>
        </div>
      </div>
      <div className="onmi-chat-actions">
        <button type="button" className="onmi-btn ghost" onClick={onToggleMessageStyle}>
          <SlidersHorizontal size={12} />
          {messageStyle === 'doc' ? t('文档流', 'Document') : t('气泡', 'Bubble')}
        </button>
        <button type="button" className="onmi-btn ghost" onClick={onExportCurrent} disabled={!conversation || messageCount === 0} title={t('导出当前会话', 'Export current session')} aria-label={t('导出当前会话', 'Export current session')}>
          <Download size={12} />
        </button>
        <button type="button" className="onmi-btn ghost" onClick={onForkCurrent} disabled={!conversation || conversation.persisted === false} title={t('分叉当前会话', 'Fork current session')} aria-label={t('分叉当前会话', 'Fork current session')}>
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
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onRegenerate: () => void;
  onEditMessage: (content: string) => void;
  canRegenerate: boolean;
}

function ChatMessages({
  currentConversation,
  useResponsesAPI,
  messageStyle,
  onSuggestionClick,
  messagesEndRef,
  isLoading,
  loadError,
  onRetry,
  onRegenerate,
  onEditMessage,
  canRegenerate,
}: ChatMessagesProps) {
  const t = useCopy();
  const user = useAuthStore((state) => state.user);
  const initials = getInitials(user?.displayName || user?.username || 'YS');

  if (isLoading) {
    return (
      <div className="onmi-chat-state" role="status">
        <RefreshCw size={18} className="animate-spin" />
        <span>{t('正在加载会话消息...', 'Loading session messages...')}</span>
      </div>
    );
  }

  if (loadError && (!currentConversation || currentConversation.messages.length === 0)) {
    return (
      <div className="onmi-chat-state error" role="alert">
        <AlertTriangle size={20} />
        <strong>{t('无法打开此会话', 'Could not open this session')}</strong>
        <span>{loadError}</span>
        <button type="button" className="onmi-btn" onClick={onRetry}>
          <RefreshCw size={11} /> {t('重试', 'Retry')}
        </button>
      </div>
    );
  }

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
      {loadError && (
        <div className="onmi-inline-error" role="alert">
          <AlertTriangle size={14} />
          <span>{loadError}</span>
          <button type="button" onClick={onRetry}>{t('重试', 'Retry')}</button>
        </div>
      )}
      {currentConversation.messages.map((message, index) => (
        <OnmiMessage
          key={message.id}
          message={message}
          index={index}
          conversation={currentConversation}
          useResponsesAPI={useResponsesAPI}
          initials={initials}
          bubble={messageStyle === 'bubble'}
          isLastMessage={index === currentConversation.messages.length - 1}
          canRegenerate={canRegenerate}
          onRegenerate={onRegenerate}
          onEditMessage={onEditMessage}
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
  isLastMessage: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onEditMessage: (content: string) => void;
}

function OnmiMessage({
  message, index, conversation, useResponsesAPI, initials, bubble,
  isLastMessage, canRegenerate, onRegenerate, onEditMessage,
}: OnmiMessageProps) {
  const t = useCopy();
  const isUser = message.role === 'user';
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  const provider = conversation.provider || '';
  const model = conversation.model || getProviderName(provider) || 'assistant';

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
          {!isUser && message.isTyping && <span className="onmi-mono onmi-mini-live">STREAM</span>}
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
            ) : message.isTyping ? (
              <div className="onmi-loading-line">
                <span className="onmi-caret" />
                <span className="onmi-mono">{t('等待模型输出…', 'Waiting for model output...')}</span>
              </div>
            ) : null}
            {message.error && (
              <div className={cn('onmi-message-status', message.status === 'cancelled' ? 'cancelled' : 'error')} role="status">
                <AlertTriangle size={13} />
                <span>{message.error}</span>
              </div>
            )}
            {message.isTyping && content && <span className="onmi-caret" />}
          </>
        ) : (
          <p className="onmi-user-text">{content}</p>
        )}

        {!message.isTyping && !isUser && (
          <div className="onmi-message-actions">
            <button type="button" className="onmi-btn ghost" onClick={copyMessage} disabled={!content}>
              <Copy size={11} />
              {t('复制', 'Copy')}
            </button>
            {isLastMessage && canRegenerate && (
              <button
                type="button"
                className="onmi-btn ghost"
                onClick={onRegenerate}
                aria-label={t('重新生成回复', 'Regenerate response')}
              >
                <RefreshCw size={11} />
                {t('重新生成', 'Regenerate')}
              </button>
            )}
          </div>
        )}

        {!message.isTyping && isUser && (
          <div className="onmi-message-actions">
            <button
              type="button"
              className="onmi-btn ghost"
              onClick={() => onEditMessage(content)}
              aria-label={t('编辑为新消息', 'Edit as new message')}
            >
              <Pencil size={11} />
              {t('编辑', 'Edit')}
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
  onKeyDown: (event: ReactKeyboardEvent) => void;
  isLoading: boolean;
  currentConversation: Conversation | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  temperature: number;
  selectedModel: AIParametersPanelProps['selectedModel'];
  onParametersChange: AIParametersPanelProps['onParametersChange'];
  onStop: () => void;
  onTemplateSelect: (message: string) => void;
  providerReady: boolean;
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
  onStop,
  onTemplateSelect,
  providerReady,
}: ChatComposerProps) {
  const t = useCopy();
  const [showTemplates, setShowTemplates] = useState(false);
  const isDisabled = !providerReady || !inputMessage.trim() || isLoading || (currentConversation?.messages.some((message) => message.isTyping) ?? false);

  useEffect(() => {
    const open = () => {
      setShowTemplates(true);
      queueMicrotask(() => textareaRef.current?.focus());
    };
    const close = () => setShowTemplates(false);
    window.addEventListener('chat:open-templates', open);
    window.addEventListener('chat:close-overlays', close);
    return () => {
      window.removeEventListener('chat:open-templates', open);
      window.removeEventListener('chat:close-overlays', close);
    };
  }, [textareaRef]);

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === '/' && inputMessage.length === 0) {
      event.preventDefault();
      setShowTemplates(true);
      return;
    }
    if (event.key === 'Escape' && showTemplates) {
      event.preventDefault();
      setShowTemplates(false);
      return;
    }
    onKeyDown(event);
  };

  return (
    <section className="onmi-composer brk">
      <textarea
        ref={textareaRef as RefObject<HTMLTextAreaElement>}
        value={inputMessage}
        onChange={(event) => setInputMessage(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        rows={1}
        placeholder={t('继续追问，或按 / 切换提示词模板…', 'Ask anything, or press / for prompt templates...')}
        className="onmi-composer-input onmi-scroll"
        aria-label={t('聊天消息', 'Chat message')}
      />
      <div className="onmi-composer-toolbar">
        <div className="onmi-template-picker">
          <button
            type="button"
            className="onmi-btn ghost onmi-tool-button"
            title={t('提示词模板', 'Prompt templates')}
            onClick={() => setShowTemplates((open) => !open)}
            aria-expanded={showTemplates}
            aria-haspopup="menu"
          >
            <Wand2 size={12} />
            <span className="onmi-toolbar-label">{t('模板', 'Templates')}</span>
          </button>
          {showTemplates && (
            <div className="onmi-template-menu" role="menu">
              {PROMPT_TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onTemplateSelect(template.text);
                    setShowTemplates(false);
                  }}
                >
                  <Sparkles size={12} />
                  <span>{template.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
        <button
          type="button"
          className={cn('onmi-btn primary', isLoading && 'stop')}
          disabled={!isLoading && isDisabled}
          onClick={isLoading ? onStop : onSend}
          title={!providerReady ? t('请先配置 Provider', 'Configure a provider first') : undefined}
        >
          {isLoading ? <Square size={12} /> : <Send size={12} />}
          <span className="onmi-send-label">{isLoading ? t('停止', 'Stop') : t('发送', 'Send')}</span>
          {!isLoading && <kbd>Enter</kbd>}
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

function buildTranscriptMarkdown(conversation: Conversation) {
  const lines = [
    `# ${conversation.title || 'ONMI session'}`,
    '',
    `- Session ID: ${conversation.id}`,
    `- Provider: ${conversation.provider || 'unknown'}`,
    `- Model: ${conversation.model || 'unknown'}`,
    `- Created: ${new Date(conversation.created_at).toISOString()}`,
    `- Exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ];

  for (const message of conversation.messages) {
    lines.push(
      `## ${message.role === 'user' ? 'User' : 'Assistant'} - ${new Date(message.timestamp).toISOString()}`,
      '',
      message.content || '_No content_',
      ''
    );

    if (message.status === 'error' || message.status === 'cancelled') {
      lines.push(`_Local response status: ${message.status}. This response is not part of saved model context._`, '');
    }

    if (message.hasThinking && message.thinkingContent) {
      lines.push('<details>', '<summary>Thinking</summary>', '', message.thinkingContent, '', '</details>', '');
    }
  }

  return lines.join('\n');
}

function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'onmi-session';
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
