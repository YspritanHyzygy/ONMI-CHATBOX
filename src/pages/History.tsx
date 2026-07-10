import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MessageSquare, Trash2, Calendar, ArrowLeft, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth } from '../lib/fetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Conversation {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  provider_used?: string;
  model_used?: string;
}

export default function History() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);

  const loadConversations = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await fetchWithAuth('/api/chat/conversations', { signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || t('history.loadFailed', { defaultValue: 'Failed to load conversation history' }));
      setConversations(Array.isArray(data.conversations) ? data.conversations : Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : t('history.loadFailed', { defaultValue: 'Failed to load conversation history' }));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadConversations(controller.signal);
    return () => controller.abort();
  }, [loadConversations]);

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.preview || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectConversation = (id: string) => {
    setSelectedConversations(prev =>
      prev.includes(id) ? prev.filter(convId => convId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedConversations.length === 0) return;
    try {
      const results = await Promise.all(
        selectedConversations.map((conversationId) =>
          fetchWithAuth(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' })
        )
      );
      if (results.every((response) => response.ok)) {
        setConversations(prev => prev.filter(conv => !selectedConversations.includes(conv.id)));
        setSelectedConversations([]);
        toast.success(t('history.deleteSuccess', { defaultValue: 'Conversations deleted' }));
      } else {
        toast.error(t('history.deleteFailed', { defaultValue: 'Delete failed' }));
      }
    } catch {
      toast.error(t('history.deleteFailed', { defaultValue: 'Delete failed' }));
    }
  };

  const handleDeleteSingle = async (conversationId: string) => {
    try {
      const response = await fetchWithAuth(`/api/chat/conversations/${conversationId}`, { method: 'DELETE' });
      if (response.ok) {
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
        setSelectedConversations(prev => prev.filter(id => id !== conversationId));
        toast.success(t('history.deleteSuccess', { defaultValue: 'Conversation deleted' }));
      } else {
        toast.error(t('history.deleteFailed', { defaultValue: 'Delete failed' }));
      }
    } catch {
      toast.error(t('history.deleteFailed', { defaultValue: 'Delete failed' }));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return t('time.today');
    if (diffDays === 2) return t('time.yesterday');
    if (diffDays <= 7) return t('time.daysAgo', { count: diffDays - 1 });
    return date.toLocaleDateString();
  };

  const getProviderName = (provider?: string) => {
    const names: Record<string, string> = { openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini', xai: 'xAI', ollama: 'Ollama' };
    return provider ? names[provider] || provider : 'Unknown';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t('history.backToChat', { defaultValue: '返回聊天' })}
                </Link>
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {t('history.title', { defaultValue: '对话历史' })}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('history.description', { defaultValue: '管理和查看您的所有AI对话记录' })}
                </p>
              </div>
            </div>
            {selectedConversations.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('history.deleteSelected', { defaultValue: '删除选中' })} ({selectedConversations.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('history.confirmDelete', { defaultValue: '确认删除' })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('history.confirmDeleteDescription', { defaultValue: `确定要删除选中的 ${selectedConversations.length} 个对话吗？`, count: selectedConversations.length })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {t('common.delete', { defaultValue: 'Delete' })}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              placeholder={t('history.searchPlaceholder', { defaultValue: '搜索对话...' })}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-16" role="alert">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive/70" />
            <h3 className="mt-3 text-sm font-medium text-foreground">{t('history.loadFailed', { defaultValue: 'Could not load conversation history' })}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" variant="outline" onClick={() => void loadConversations()}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              {searchQuery
                ? t('history.noResults', { defaultValue: '未找到匹配的对话' })
                : t('history.empty', { defaultValue: '暂无对话历史' })
              }
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {searchQuery
                ? t('history.tryDifferent', { defaultValue: '尝试使用不同的关键词搜索' })
                : (
                  <>
                    {t('history.startFirst', { defaultValue: '开始您的第一次AI对话' })}{' '}
                    <Link to="/chat" className="text-primary hover:text-primary/80">
                      {t('history.startNow', { defaultValue: '立即开始' })}
                    </Link>
                  </>
                )
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConversations.map((conversation) => (
              <Card key={conversation.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedConversations.includes(conversation.id)}
                        onChange={() => handleSelectConversation(conversation.id)}
                        aria-label={t('history.selectConversation', {
                          defaultValue: `Select ${conversation.title}`,
                          title: conversation.title,
                        })}
                        className="mt-1.5 h-4 w-4 rounded border-input"
                      />
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/chat?conversation=${conversation.id}`)}
                      >
                        <h3 className="font-medium text-foreground truncate hover:text-primary transition-colors">
                          {conversation.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {conversation.preview || t('history.noPreview', { defaultValue: 'No preview available' })}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(conversation.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {conversation.message_count} {t('history.messages', { defaultValue: '条消息' })}
                          </span>
                          {conversation.provider_used && (
                            <Badge variant="secondary" className="text-[10px]">
                              {getProviderName(conversation.provider_used)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/chat?conversation=${conversation.id}`)}
                        aria-label={t('history.openConversation', {
                          defaultValue: `Open ${conversation.title}`,
                          title: conversation.title,
                        })}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={t('history.deleteConversation', {
                              defaultValue: `Delete ${conversation.title}`,
                              title: conversation.title,
                            })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('history.confirmDeleteSingle', { defaultValue: '删除对话？' })}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('history.confirmDeleteSingleDescription', { defaultValue: '此操作不可撤销。' })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteSingle(conversation.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              {t('common.delete', { defaultValue: 'Delete' })}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
