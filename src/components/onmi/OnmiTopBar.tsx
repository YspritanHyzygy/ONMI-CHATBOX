import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeft, Search, Settings } from 'lucide-react';
import { OnmiLogo, ProviderGlyph, StatusDot } from './OnmiPrimitives';

interface OnmiTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  modelLabel?: string;
  provider?: string | null;
  status?: string;
  commandLabel?: string;
  onCommand?: () => void;
  controls?: ReactNode;
  settingsHref?: string;
  accountLabel?: string;
}

export default function OnmiTopBar({
  sidebarOpen,
  onToggleSidebar,
  modelLabel,
  provider,
  status = 'CONNECTED',
  commandLabel = '搜索 / 命令',
  onCommand,
  controls,
  settingsHref,
  accountLabel = 'Settings',
}: OnmiTopBarProps) {
  return (
    <header className="onmi-topbar">
      <button
        type="button"
        className="onmi-icon-button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? '隐藏侧栏' : '显示侧栏'}
      >
        <PanelLeft size={15} />
      </button>
      <div className="onmi-divider-vertical" />
      <OnmiLogo />
      <div className="onmi-topbar-spacer" />
      {modelLabel && (
        <div className="onmi-model-chip">
          <ProviderGlyph provider={provider} size={18} />
          <span className="onmi-mono">{modelLabel}</span>
        </div>
      )}
      {controls}
      <button type="button" className="onmi-command-button" onClick={onCommand}>
        <Search size={13} />
        <span>{commandLabel}</span>
        <kbd>Ctrl</kbd>
        <kbd>K</kbd>
      </button>
      {settingsHref && (
        <Link
          to={settingsHref}
          className="onmi-icon-button onmi-settings-link"
          aria-label={accountLabel}
          title={accountLabel}
        >
          <Settings size={14} />
          <span>{accountLabel}</span>
        </Link>
      )}
      <div className="onmi-divider-vertical" />
      <StatusDot state={status.includes('WARN') ? 'warn' : 'live'} label={status} />
    </header>
  );
}
