import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Activity, Database, History as HistoryIcon, KeyRound, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnmiLogo } from './OnmiPrimitives';
import { useOnmiCopy } from './useOnmiCopy';

export interface OnmiNavItem {
  id: string;
  labelZh: string;
  labelEn: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  placeholder?: boolean;
}

const MAIN_ONMI_NAV: OnmiNavItem[] = [
  { id: 'chat', labelZh: '会话控制台', labelEn: 'Chat console', path: '/chat', icon: MessageSquare },
  { id: 'history', labelZh: '对话历史', labelEn: 'History', path: '/history', icon: HistoryIcon },
  { id: 'settings', labelZh: 'API 凭证', labelEn: 'API credentials', path: '/settings', icon: KeyRound },
  { id: 'data', labelZh: '数据 · I/O', labelEn: 'Data · I/O', path: '/data', icon: Database },
  { id: 'usage', labelZh: '本地用量', labelEn: 'Local usage', path: '/usage', icon: Activity, badge: 'EST' },
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
  const copy = useOnmiCopy();
  const sidebarRef = useRef<HTMLElement>(null);
  const onCloseSidebarRef = useRef(onCloseSidebar);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  onCloseSidebarRef.current = onCloseSidebar;

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    if (sidebarOpen) sidebar.removeAttribute('inert');
    else sidebar.setAttribute('inert', '');
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen && returnFocusRef.current) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen || !onCloseSidebarRef.current) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseSidebarRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    if (window.matchMedia('(max-width: 899px)').matches) {
      if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
      const firstFocusable = sidebarRef.current?.querySelector<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])');
      firstFocusable?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  const handleSidebarClick = (event: MouseEvent<HTMLElement>) => {
    if (!onCloseSidebar || !window.matchMedia('(max-width: 899px)').matches) return;
    if ((event.target as HTMLElement).closest('a')) onCloseSidebar();
  };

  return (
    <div className="onmi onmi-app">
      {topbar}
      <div className="onmi-main">
        {sidebarOpen && (
          <button
            type="button"
            className="onmi-mobile-scrim"
            aria-label={copy('关闭侧栏', 'Close sidebar')}
            onClick={onCloseSidebar}
          />
        )}
        <aside
          id="onmi-sidebar"
          ref={sidebarRef}
          className={cn('onmi-sidebar-wrap', sidebarOpen ? 'open' : 'closed')}
          aria-hidden={!sidebarOpen}
          onClick={handleSidebarClick}
        >
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
  const copy = useOnmiCopy();

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
              <span>{copy(item.labelZh, item.labelEn)}</span>
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
