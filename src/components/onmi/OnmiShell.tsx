import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Activity, Database, KeyRound, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnmiLogo } from './OnmiPrimitives';

export interface OnmiNavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  placeholder?: boolean;
}

const MAIN_ONMI_NAV: OnmiNavItem[] = [
  { id: 'chat', label: '会话控制台', path: '/chat', icon: MessageSquare },
  { id: 'settings', label: 'API 凭证', path: '/settings', icon: KeyRound },
  { id: 'data', label: '数据 · I/O', path: '/data', icon: Database },
  { id: 'usage', label: '本地用量', path: '/usage', icon: Activity, badge: 'EST' },
  { id: 'command', label: '命令面板', path: '/chat', icon: Settings, placeholder: true },
];

interface OnmiPageShellProps {
  topbar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  onCloseSidebar?: () => void;
}

export function OnmiPageShell({
  topbar,
  sidebar,
  children,
  sidebarOpen,
  onCloseSidebar,
}: OnmiPageShellProps) {
  return (
    <div className="onmi onmi-app">
      {topbar}
      <div className="onmi-main">
        {sidebarOpen && (
          <button
            type="button"
            className="onmi-mobile-scrim"
            aria-label="关闭侧栏"
            onClick={onCloseSidebar}
          />
        )}
        <aside className={cn('onmi-sidebar-wrap', sidebarOpen ? 'open' : 'closed')}>
          {sidebar}
        </aside>
        <main className="onmi-content">{children}</main>
      </div>
    </div>
  );
}

interface OnmiStaticSidebarProps {
  activeId?: string;
  footer?: ReactNode;
}

export function OnmiStaticSidebar({ activeId, footer }: OnmiStaticSidebarProps) {
  const location = useLocation();

  return (
    <div className="onmi-sidebar">
      <div className="onmi-sidebar-head">
        <OnmiLogo size={18} />
        <span className="onmi-mono">SELF-HOSTED</span>
      </div>
      <nav className="onmi-nav-list">
        {MAIN_ONMI_NAV.map((item) => {
          const Icon = item.icon;
          const active = activeId === item.id || (!activeId && location.pathname === item.path);
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn('onmi-nav-item', active && 'active', item.placeholder && 'placeholder')}
              aria-disabled={item.placeholder}
            >
              <Icon size={14} />
              <span>{item.label}</span>
              {item.badge && <b>{item.badge}</b>}
            </Link>
          );
        })}
      </nav>
      <div className="onmi-sidebar-fill" />
      {footer}
    </div>
  );
}
