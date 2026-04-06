import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MessageSquare, Trash2, Calendar, ArrowLeft, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      } else {
        setConversations([]);
      }
    } catch {
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectConversation = (id: string) => {
    setSelectedConversations(prev =>
      prev.includes(id) ? prev.filter(convId => convId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedConversations.length === 0) return;
    try {
      const response = await fetch('/api/conversations/batch-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIds: selectedConversations }),
      });
      if (response.ok) {
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
      const response = await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
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
                          {conversation.preview}
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
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
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
