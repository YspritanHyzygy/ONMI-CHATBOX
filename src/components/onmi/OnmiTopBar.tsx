import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeft, Search, Settings } from 'lucide-react';
import { OnmiLogo, ProviderGlyph, StatusDot } from './OnmiPrimitives';
import { useOnmiCopy } from './useOnmiCopy';

interface OnmiTopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  modelLabel?: string;
  provider?: string | null;
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
  commandLabel = '搜索 / 命令',
  onCommand,
  controls,
  settingsHref,
  accountLabel = 'Settings',
}: OnmiTopBarProps) {
  const copy = useOnmiCopy();
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const checkHealth = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { success?: boolean };
      setHealth(response.ok && result.success === true ? 'online' : 'offline');
    } catch {
      setHealth('offline');
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    window.addEventListener('online', checkHealth);
    window.addEventListener('focus', checkHealth);
    return () => {
      window.removeEventListener('online', checkHealth);
      window.removeEventListener('focus', checkHealth);
    };
  }, [checkHealth]);

  const statusLabel = health === 'checking' ? 'CHECKING' : health === 'online' ? 'BACKEND OK' : 'BACKEND DOWN';
  const statusState = health === 'checking'
    ? 'off'
    : health === 'online'
      ? 'ok'
      : 'err';

  return (
    <header className="onmi-topbar">
      <button
        type="button"
        className="onmi-icon-button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? copy('隐藏侧栏', 'Hide sidebar') : copy('显示侧栏', 'Show sidebar')}
        aria-expanded={sidebarOpen}
        aria-controls="onmi-sidebar"
      >
        <PanelLeft size={15} />
      </button>
      <div className="onmi-divider-vertical" />
      <OnmiLogo />
      <div className="onmi-topbar-spacer" />
      {modelLabel && (
        <div className="onmi-model-chip">
          {provider && <ProviderGlyph provider={provider} size={18} />}
          <span className="onmi-mono">{modelLabel}</span>
        </div>
      )}
      {controls}
      {onCommand && (
        <button type="button" className="onmi-command-button" onClick={onCommand}>
          <Search size={13} />
          <span>{commandLabel}</span>
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </button>
      )}
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
      <StatusDot state={statusState} label={statusLabel} />
    </header>
  );
}
