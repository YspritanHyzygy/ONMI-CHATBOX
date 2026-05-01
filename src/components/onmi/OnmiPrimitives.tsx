import type { CSSProperties, ReactNode } from 'react';
import { getProviderVisual } from './providerMeta';

interface LogoProps {
  size?: number;
  showWord?: boolean;
  className?: string;
}

export function OnmiLogo({ size = 18, showWord = true, className = '' }: LogoProps) {
  return (
    <div className={`onmi-logo ${className}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
        <circle cx="12" cy="12" r="2.5" fill="var(--bg-1)" />
      </svg>
      {showWord && (
        <span className="onmi-mono onmi-logo-word">
          ONMI<span>·</span>CB
        </span>
      )}
    </div>
  );
}

interface ProviderGlyphProps {
  provider?: string | null;
  size?: number;
  active?: boolean;
  className?: string;
}

export function ProviderGlyph({ provider, size = 24, active = false, className = '' }: ProviderGlyphProps) {
  const visual = getProviderVisual(provider);
  const style = {
    '--glyph-size': `${size}px`,
    '--glyph-color': visual.color,
  } as CSSProperties;

  return (
    <span
      className={`onmi-provider-glyph ${active ? 'is-active' : ''} ${className}`}
      style={style}
      title={visual.name}
    >
      {visual.code}
    </span>
  );
}

interface StatusDotProps {
  state?: 'live' | 'ok' | 'warn' | 'err' | 'off';
  label?: string;
}

export function StatusDot({ state = 'off', label }: StatusDotProps) {
  return (
    <span className="onmi-status">
      <span className={`onmi-dot ${state}`} />
      {label && <span className="onmi-mono">{label}</span>}
    </span>
  );
}

interface EmptyPanelProps {
  title: string;
  description: string;
  children?: ReactNode;
}

export function OnmiEmptyPanel({ title, description, children }: EmptyPanelProps) {
  return (
    <div className="onmi-empty brk">
      <div className="onmi-section-label">IDLE · READY</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="onmi-empty-actions">{children}</div>}
    </div>
  );
}

export function OnmiRule({ children }: { children: ReactNode }) {
  return <div className="onmi-rule">{children}</div>;
}
