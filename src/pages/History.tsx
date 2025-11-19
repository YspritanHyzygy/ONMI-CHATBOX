import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MessageSquare, Trash2, Calendar, ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
        console.error('获取对话历史失败:', response.statusText);
        // 使用模拟数据作为后备
        const mockConversations: Conversation[] = [
          {
            id: '1',
            title: '关于React的问题',
            preview: '请解释一下React的useState钩子是如何工作的？',
            created_at: '2024-01-15T10:30:00Z',
            updated_at: '2024-01-15T10:45:00Z',
            message_count: 8,
            provider_used: 'openai',
            model_used: 'gpt-3.5-turbo'
          },
          {
            id: '2',
            title: 'Python编程帮助',
            preview: '如何在Python中处理异常？',
            created_at: '2024-01-14T15:20:00Z',
            updated_at: '2024-01-14T15:35:00Z',
            message_count: 12,
            provider_used: 'claude',
            model_used: 'claude-3-sonnet'
          },
          {
            id: '3',
            title: '数据库设计讨论',
            preview: '设计一个电商系统的数据库结构',
            created_at: '2024-01-13T09:15:00Z',
            updated_at: '2024-01-13T10:00:00Z',
            message_count: 15,
            provider_used: 'gemini',
            model_used: 'gemini-pro'
          }
        ];
        setConversations(mockConversations);
      }
    } catch (error) {
      console.error('加载对话历史失败:', error);
      // 使用模拟数据作为后备
      const mockConversations: Conversation[] = [];
      setConversations(mockConversations);
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
      prev.includes(id) 
        ? prev.filter(convId => convId !== id)
        : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedConversations.length === 0) return;
    
    if (confirm(`确定要删除选中的 ${selectedConversations.length} 个对话吗？`)) {
      try {
        const response = await fetch('/api/conversations/batch-delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationIds: selectedConversations }),
        });
        
        if (response.ok) {
          setConversations(prev => 
            prev.filter(conv => !selectedConversations.includes(conv.id))
          );
          setSelectedConversations([]);
        } else {
          console.error('删除对话失败:', response.statusText);
          alert('删除失败，请稍后重试');
        }
      } catch (error) {
        console.error('删除对话失败:', error);
        alert('删除失败，请稍后重试');
      }
    }
  };

  const handleDeleteSingle = async (conversationId: string) => {
    if (confirm('确定要删除这个对话吗？')) {
      try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          setConversations(prev => prev.filter(conv => conv.id !== conversationId));
          setSelectedConversations(prev => prev.filter(id => id !== conversationId));
        } else {
          console.error('删除对话失败:', response.statusText);
          alert('删除失败，请稍后重试');
        }
      } catch (error) {
        console.error('删除对话失败:', error);
        alert('删除失败，请稍后重试');
      }
    }
  };

  const handleOpenConversation = (conversationId: string) => {
    // 跳转到聊天页面并加载指定对话
    navigate(`/chat?conversation=${conversationId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return t('time.today');
    } else if (diffDays === 2) {
      return t('time.yesterday');
    } else if (diffDays <= 7) {
      return t('time.daysAgo', { count: diffDays - 1 });
    } else {
      return date.toLocaleDateString();
    }
  };

  const getProviderName = (provider?: string) => {
    const providerNames: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Claude',
      gemini: 'Gemini',
      xai: 'xAI',
      ollama: 'Ollama'
    };
    return provider ? providerNames[provider] || provider : '未知';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  to="/"
                  className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  返回聊天
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">对话历史</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    管理和查看您的所有AI对话记录
                  </p>
                </div>
              </div>
              {selectedConversations.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除选中 ({selectedConversations.length})
                </button>
              )}
            </div>

            {/* 搜索栏 */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="搜索对话..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-500">加载中...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {searchQuery ? '未找到匹配的对话' : '暂无对话历史'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery ? '尝试使用不同的关键词搜索' : (
                <>
                  开始您的第一次AI对话吧 {' '}
                  <Link to="/chat" className="text-blue-600 hover:text-blue-500">
                    立即开始
                  </Link>
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedConversations.includes(conversation.id)}
                        onChange={() => handleSelectConversation(conversation.id)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenConversation(conversation.id)}>
                        <h3 className="text-lg font-medium text-gray-900 truncate hover:text-blue-600 transition-colors">
                          {conversation.title}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                          {conversation.preview}
                        </p>
                        <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                          <div className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {formatDate(conversation.created_at)}
                          </div>
                          <div className="flex items-center">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {conversation.message_count} 条消息
                          </div>
                          {conversation.provider_used && (
                            <div className="flex items-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {getProviderName(conversation.provider_used)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleOpenConversation(conversation.id)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="打开对话"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteSingle(conversation.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="删除对话"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}