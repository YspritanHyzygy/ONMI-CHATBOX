import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bot, Plus, MessageSquare, Trash2,
  Settings as SettingsIcon, LogOut, Sun, Moon, Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { useTheme } from '@/components/ThemeProvider';
import useAuthStore from '@/store/authStore';
import type { Conversation } from '@/hooks/useChat';

interface AppSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onNewConversation: () => void;
  onConversationSelect: (conversation: Conversation) => void;
  onClearAllConversations?: () => void;
  formatTime: (date: Date) => string;
}

export default function AppSidebar({
  conversations,
  currentConversation,
  onNewConversation,
  onConversationSelect,
  onClearAllConversations,
  formatTime,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-sidebar-primary" />
          <span className="font-semibold text-sm">OMNICHAT</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewConversation}
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider">
              {t('sidebar.history')}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-sidebar-foreground/40">
                {conversations.length}
              </span>
              {conversations.length > 0 && onClearAllConversations && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('sidebar.clearAllTitle', { defaultValue: 'Clear all conversations?' })}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('sidebar.clearAllDescription', { defaultValue: 'This action cannot be undone. All conversations will be permanently deleted.' })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onClearAllConversations}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t('common.delete', { defaultValue: 'Delete' })}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sidebar-foreground/40">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">{t('sidebar.noConversations')}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => onConversationSelect(conversation)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentConversation?.id === conversation.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50'
                  }`}
                >
                  <div className="font-medium truncate text-[13px]">
                    {conversation.title}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-sidebar-foreground/40">
                      {t('sidebar.messageCount', { count: conversation.messages?.length || 0 })}
                    </span>
                    <span className="text-xs text-sidebar-foreground/40">
                      {formatTime(conversation.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* User Footer */}
      {user && (
        <div className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate text-sidebar-foreground">
                    {user.displayName || user.username}
                  </div>
                  <div className="text-xs text-sidebar-foreground/50 truncate">
                    @{user.username}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{user.displayName || user.username}</div>
                <div className="text-xs text-muted-foreground">@{user.username}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="cursor-pointer">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  {t('settings.title', { defaultValue: 'Settings' })}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === 'dark' ? (
                    <Moon className="mr-2 h-4 w-4" />
                  ) : theme === 'light' ? (
                    <Sun className="mr-2 h-4 w-4" />
                  ) : (
                    <Monitor className="mr-2 h-4 w-4" />
                  )}
                  {t('settings.theme', { defaultValue: 'Theme' })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => setTheme('light')}>
                    <Sun className="mr-2 h-4 w-4" />
                    {t('settings.themeLight', { defaultValue: 'Light' })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('dark')}>
                    <Moon className="mr-2 h-4 w-4" />
                    {t('settings.themeDark', { defaultValue: 'Dark' })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme('system')}>
                    <Monitor className="mr-2 h-4 w-4" />
                    {t('settings.themeSystem', { defaultValue: 'System' })}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t('auth.logout', { defaultValue: 'Log out' })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
