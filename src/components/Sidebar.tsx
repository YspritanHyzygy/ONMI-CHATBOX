/**
 * 侧边栏组件 - 可折叠的多功能导航栏
 * 
 * 状态说明：
 * - ✅ 已实现：聊天对话、对话历史、用户信息
 * - ⏳ 占位符：数据分析、工具箱、文件管理、自定义功能
 * 
 * 注意：占位符功能点击后无实际作用，需要实现对应的页面和功能
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Bot, Plus, MessageSquare, ChevronDown, ChevronRight,
  BarChart3, Wrench, FolderOpen, Palette, History, Menu, Trash2
} from 'lucide-react';
import UserHeader from './UserHeader';

interface SidebarProps {
  showSidebar: boolean;
  conversations: any[];
  currentConversation: any;
  onNewConversation: () => void;
  onConversationSelect: (conversation: any) => void;
  onClearAllConversations?: () => void;
  formatTime: (date: Date) => string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path?: string;
  badge?: number;
  children?: NavItem[];
}

export default function Sidebar({
  showSidebar,
  conversations,
  currentConversation,
  onNewConversation,
  onConversationSelect,
  onClearAllConversations,
  formatTime
}: SidebarProps) {

  const { t } = useTranslation();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(['history']);
  const [functionsCollapsed, setFunctionsCollapsed] = useState(true); // 默认折叠
  
  // 主导航配置 - 你可以在这里添加新功能
  // 注意：除了第一个"聊天对话"外，其他都是功能占位符，需要实际实现
  const mainNavItems: NavItem[] = [
    {
      id: 'chat',
      label: t('chat.title'),
      icon: MessageSquare,
      path: '/',
      children: []
    },
    // ============ 以下为功能占位符，需要实际实现 ============
    {
      id: 'analytics',
      label: t('sidebar.dataAnalytics'), // 占位符 - 需要创建分析页面
      icon: BarChart3,
      path: '/analytics', // 路由未实现
      badge: 3 // 示例数字，实际需要动态计算
    },
    {
      id: 'tools',
      label: t('sidebar.toolbox'), // 占位符 - 需要实现工具集合
      icon: Wrench,
      children: [
        { id: 'tool1', label: t('sidebar.textProcessing'), icon: Wrench, path: '/tools/text' }, // 占位符路由
        { id: 'tool2', label: t('sidebar.imageGeneration'), icon: Palette, path: '/tools/image' }, // 占位符路由
        // 在这里添加更多工具
      ]
    },
    {
      id: 'files',
      label: t('sidebar.fileManagement'), // 占位符 - 需要实现文件上传/管理功能
      icon: FolderOpen,
      path: '/files', // 路由未实现
      badge: 5 // 示例数字
    },
    {
      id: 'custom',
      label: t('sidebar.customFunctions'), // 占位符 - 预留给用户自定义功能
      icon: Palette,
      children: [
        // 预留给你的自定义功能 - 目前为空
      ]
    }
    // ============ 占位符区域结束 ============
  ];

  // 获取要显示的功能项（折叠时只显示第一个）
  const visibleNavItems = functionsCollapsed ? [mainNavItems[0]] : mainNavItems;

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const renderNavItem = (item: NavItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedSections.includes(item.id);
    const active = item.path ? isActive(item.path) : false;

    return (
      <div key={item.id}>
        {/* 主导航项 */}
        <div
          className={`flex items-center px-3 py-2 rounded-lg transition-colors cursor-pointer group ${
            level === 0 ? 'mx-2' : 'mx-4'
          } ${
            active 
              ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-500' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => {
            if (hasChildren) {
              toggleSection(item.id);
            } else if (item.path) {
              // TODO: 需要实现路由跳转逻辑
              // 目前只有 '/' (聊天页面) 是实际可用的
              // 其他路由如 '/analytics', '/files' 等都是占位符
              console.log('点击功能：', item.label, '路由：', item.path);
              if (item.path === '/') {
                // 只有聊天页面可以正常跳转
                window.location.href = item.path;
              } else {
                // 占位符功能的提示
                alert(t('sidebar.featureNotImplemented', { feature: item.label }));
              }
            } else {
              // 无路由的菜单项（如自定义功能）
              console.log('点击无路由菜单：', item.label);
            }
          }}
        >
          {/* 展开/收起图标 */}
          {hasChildren && (
            <div className="w-4 h-4 mr-2">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          )}
          
          {/* 功能图标 */}
          <item.icon className={`w-4 h-4 ${hasChildren ? '' : 'mr-2'} ${!hasChildren ? 'ml-2' : ''}`} />
          
          {/* 标签文本 */}
          <span className="flex-1 text-sm font-medium ml-2">
            {item.label}
          </span>
          
          {/* 徽章 */}
          {item.badge && (
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
              {item.badge}
            </span>
          )}
        </div>

        {/* 子菜单 */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.map(child => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!showSidebar) return null;

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Logo和网站名称 */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-center mb-4">
          <Bot className="w-6 h-6 mr-2" />
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            OMNICHAT
          </h1>
        </div>
      </div>

      {/* 新建对话按钮 */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('sidebar.newConversation')}
        </button>
      </div>

      {/* 主导航区域 */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* 功能区域头部 */}
        <div className="p-3 border-b border-gray-100 flex-shrink-0">
          <button 
            className="w-full flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-lg p-2 transition-colors border border-transparent hover:border-gray-200"
            onClick={() => setFunctionsCollapsed(!functionsCollapsed)}
          >
            <div className="flex items-center">
              <Menu className="w-4 h-4 mr-2 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('sidebar.functionMenu')}</span>
            </div>
            <div className="flex items-center">
              {!functionsCollapsed && mainNavItems.length > 1 && (
                <span className="text-xs text-gray-400 mr-2">({mainNavItems.length})</span>
              )}
              <div className="p-1 rounded hover:bg-gray-200 transition-colors">
                {functionsCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                )}
              </div>
            </div>
          </button>
        </div>

        {/* 主功能导航 */}
        <div className="p-2 flex-shrink-0">
          <div className="space-y-1">
            {visibleNavItems.map(item => renderNavItem(item))}
          </div>
          
          {/* 折叠状态下的视觉提示 */}
          {functionsCollapsed && mainNavItems.length > 1 && (
            <div className="mt-2 mx-2">
              <div className="flex items-center justify-center py-1">
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-gray-300 rounded-full opacity-60"></div>
                  <div className="w-1 h-1 bg-gray-300 rounded-full opacity-60"></div>
                  <div className="w-1 h-1 bg-gray-300 rounded-full opacity-60"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 对话历史区域 - 常驻显示，始终展开 */}
        <div className="border-t border-gray-100 flex-1 flex flex-col min-h-0">
          <div className="flex items-center px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 flex-shrink-0">
            <History className="w-4 h-4 mr-2 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">{t('sidebar.history')}</span>
            <span className="ml-auto text-xs text-blue-600 font-medium">({conversations.length})</span>
            {conversations.length > 0 && onClearAllConversations && (
              <button
                onClick={onClearAllConversations}
                className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title={t('sidebar.clearAll')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 对话列表 - 始终完全展开 */}
          <div className="overflow-y-auto flex-1">
            
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-xs">{t('sidebar.noConversations')}</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  className={`p-3 mx-2 mb-1 cursor-pointer hover:bg-gray-50 rounded-lg border transition-colors ${
                    currentConversation?.id === conversation.id 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 truncate mb-1">
                    {conversation.title}
                  </div>
                  {conversation.messages?.length > 0 && (
                    <div className="text-xs text-gray-500 truncate mb-2">
                      {conversation.messages[conversation.messages.length - 1].content}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{t('sidebar.messageCount', { count: conversation.messages?.length || 0 })}</span>
                    <span>{formatTime(conversation.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 底部固定区域 */}
      <div className="border-t border-gray-200 bg-gray-50 flex-shrink-0">
        {/* 用户信息 */}
        <UserHeader />
      </div>
    </div>
  );
}