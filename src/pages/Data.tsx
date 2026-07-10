import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileUp,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { OnmiPageShell, OnmiStaticSidebar } from '@/components/onmi/OnmiShell';
import { OnmiRule } from '@/components/onmi/OnmiPrimitives';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar';
import { fetchWithAuth } from '@/lib/fetch';
import useAuthStore from '@/store/authStore';

interface DataPreview {
  user: { username: string; displayName?: string; created_at: string };
  stats: { conversations: number; messages: number; aiProviders: number };
}

interface DataHealth {
  dbVersion: number;
  currentVersion: number;
  pendingMigrations: number[];
  migrationHistory: { version: number; migrated_at: string; description: string }[];
  counts: { users: number; conversations: number; messages: number; aiProviders: number };
  integrity: {
    orphanMessages: number;
    orphanConversations: number;
    duplicateUsernames: number;
    duplicateIds: number;
  };
  latestBackup: null | { filename: string; createdAt: string; sizeBytes: number };
}

interface BackupFile {
  version: string;
  exportDate?: string;
  conversations?: unknown[];
  messages?: unknown[];
  aiProviders?: unknown[];
  metadata?: {
    totalConversations?: number;
    totalMessages?: number;
    totalAIProviders?: number;
    credentialsIncluded?: boolean;
  };
  [key: string]: unknown;
}

interface ImportCandidate {
  name: string;
  data: BackupFile;
  conversations: number;
  messages: number;
  providers: number;
  hasCredentials: boolean;
}

type MergeMode = 'merge' | 'replace';
type LoadState = 'loading' | 'ready' | 'error';

const CREDENTIAL_KEY = /^(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|password|authorization)$/i;

function containsCredentials(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsCredentials);
  return Object.entries(value).some(([key, child]) => (
    CREDENTIAL_KEY.test(key) || containsCredentials(child)
  ));
}

function errorFrom(result: unknown, fallback: string) {
  if (result && typeof result === 'object' && 'error' in result && typeof (result as { error?: unknown }).error === 'string') {
    return (result as { error: string }).error;
  }
  return fallback;
}

export default function DataPage() {
  const copy = useOnmiCopy();
  const user = useAuthStore((state) => state.user);
  const { showSidebar, setShowSidebar } = useResponsiveSidebar();
  const [preview, setPreview] = useState<DataPreview | null>(null);
  const [previewState, setPreviewState] = useState<LoadState>('loading');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [healthState, setHealthState] = useState<LoadState>('loading');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>('merge');
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ImportCandidate | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userId = user?.id;

  const loadPreview = useCallback(async (signal?: AbortSignal) => {
    if (!userId) {
      setPreview(null);
      setPreviewState('error');
      setPreviewError(copy('请先登录', 'Please sign in first'));
      return;
    }
    setPreviewState('loading');
    setPreviewError(null);
    try {
      const response = await fetchWithAuth(`/api/data/preview/${encodeURIComponent(userId)}`, { signal });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: DataPreview; error?: string };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(errorFrom(result, copy('数据概览加载失败', 'Failed to load data overview')));
      }
      setPreview(result.data);
      setPreviewState('ready');
    } catch (error) {
      if (signal?.aborted) return;
      setPreviewState('error');
      setPreviewError(error instanceof Error ? error.message : copy('数据概览加载失败', 'Failed to load data overview'));
    }
  }, [copy, userId]);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    setHealthState('loading');
    setHealthError(null);
    try {
      const response = await fetchWithAuth('/api/data/health', { signal });
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: DataHealth; error?: string };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(errorFrom(result, copy('健康报告加载失败', 'Failed to load data health report')));
      }
      setHealth(result.data);
      setHealthState('ready');
    } catch (error) {
      if (signal?.aborted) return;
      setHealthState('error');
      setHealthError(error instanceof Error ? error.message : copy('健康报告加载失败', 'Failed to load data health report'));
    }
  }, [copy]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([loadPreview(controller.signal), loadHealth(controller.signal)]);
    return () => controller.abort();
  }, [loadHealth, loadPreview]);

  const handleExport = async () => {
    if (!userId) return;
    if (includeCredentials && !window.confirm(copy(
      '此备份将包含可直接使用的 API Key，并以明文 JSON 保存。确认继续？',
      'This backup will contain usable API keys in plaintext JSON. Continue?',
    ))) return;

    setIsExporting(true);
    try {
      const query = includeCredentials ? '?includeCredentials=true' : '';
      const response = await fetchWithAuth(`/api/data/export/${encodeURIComponent(userId)}${query}`);
      const result = await response.json().catch(() => ({})) as { success?: boolean; data?: BackupFile; error?: string };
      if (!response.ok || !result.success || !result.data) {
        throw new Error(errorFrom(result, copy('导出失败', 'Export failed')));
      }
      const dataBlob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `onmi-chatbox-${preview?.user.username || user?.username || 'backup'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(includeCredentials
        ? copy('含凭证备份已导出', 'Backup with credentials exported')
        : copy('安全备份已导出（不含 API Key）', 'Safe backup exported without API keys'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy('导出失败', 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as BackupFile;
      if (!data || typeof data !== 'object' || typeof data.version !== 'string') {
        throw new Error(copy('无效的备份文件格式', 'Invalid backup file format'));
      }
      const conversations = data.metadata?.totalConversations ?? data.conversations?.length ?? 0;
      const messages = data.metadata?.totalMessages ?? data.messages?.length ?? 0;
      const providers = data.metadata?.totalAIProviders ?? data.aiProviders?.length ?? 0;
      const hasCredentials = data.metadata?.credentialsIncluded === true || containsCredentials(data.aiProviders);
      setImportCandidate({ name: file.name, data, conversations, messages, providers, hasCredentials });
    } catch (error) {
      setImportCandidate(null);
      toast.error(error instanceof Error ? error.message : copy('无法读取备份文件', 'Could not read backup file'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!userId || !importCandidate) return;
    const confirmReplace = mergeMode !== 'replace' || window.confirm(copy(
      '覆盖模式会先清空当前会话、消息与 Provider 配置。确认覆盖？',
      'Replace mode wipes current conversations, messages, and provider configuration first. Confirm replace?',
    ));
    if (!confirmReplace) return;
    const confirmCredentials = !importCandidate.hasCredentials || window.confirm(copy(
      '此文件包含 Provider 凭证，导入后会以明文保存在本机数据库。确认导入凭证？',
      'This file contains provider credentials that will be stored in plaintext locally. Import credentials?',
    ));
    if (!confirmCredentials) return;

    setIsImporting(true);
    try {
      const response = await fetchWithAuth(`/api/data/import/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: importCandidate.data,
          mergeMode,
          confirmReplace: mergeMode === 'replace',
          confirmCredentials: importCandidate.hasCredentials,
        }),
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(errorFrom(result, copy('导入失败', 'Import failed')));
      toast.success(copy('数据导入完成', 'Data import complete'));
      setImportCandidate(null);
      await Promise.all([loadPreview(), loadHealth()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy('导入失败', 'Import failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const statValue = (value: number) => previewState === 'ready' ? value : '—';

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={<OnmiTopBar sidebarOpen={showSidebar} onToggleSidebar={() => setShowSidebar((open) => !open)} modelLabel="DATA TRANSFER" />}
      sidebar={<OnmiStaticSidebar activeId="data" />}
    >
      <div className="onmi-data onmi-scroll">
        <div className="onmi-page-header">
          <div className="onmi-section-label">CONFIG · 04 · DATA TRANSFER</div>
          <h1>{copy('数据传输 · 导入导出', 'Data transfer · Import/Export')}</h1>
          <p>{copy('默认备份不会导出 API Key。导入前会在本机预览内容，高风险操作必须再次确认。', 'Backups exclude API keys by default. Imports are previewed locally, and risky actions require explicit confirmation.')}</p>
        </div>

        {previewState === 'error' && <LoadError message={previewError} onRetry={() => void loadPreview()} copy={copy} />}
        <section className="onmi-data-stats">
          <Stat label={copy('会话', 'Sessions')} value={statValue(preview?.stats.conversations ?? 0)} />
          <Stat label={copy('消息', 'Messages')} value={statValue(preview?.stats.messages ?? 0)} />
          <Stat label={copy('Provider 配置', 'Provider configs')} value={statValue(preview?.stats.aiProviders ?? 0)} />
          <Stat label={copy('备份格式', 'Backup format')} value="v2 JSON" />
        </section>

        <section className="onmi-data-grid">
          <div className="onmi-data-card">
            <div className="onmi-data-card-head"><Download size={15} /><strong>{copy('导出 · EXPORT', 'Export · EXPORT')}</strong><span className="onmi-mono">→ .json</span></div>
            <div className="onmi-data-card-body">
              <OnmiRule>{copy('包含内容', 'Include')}</OnmiRule>
              <DataOption label={copy('全部会话', 'All sessions')} value={`${preview?.stats.conversations ?? '—'} conv`} enabled />
              <DataOption label={copy('全部消息', 'All messages')} value={`${preview?.stats.messages ?? '—'} msg`} enabled />
              <DataOption label={copy('Provider 配置（不含 API Key）', 'Provider config (without API keys)')} value={`${preview?.stats.aiProviders ?? '—'} cfg`} enabled />
              <label className="onmi-credential-opt-in">
                <input type="checkbox" checked={includeCredentials} onChange={(event) => setIncludeCredentials(event.target.checked)} />
                <span><strong>{copy('包含 Provider 凭证', 'Include provider credentials')}</strong><small>{copy('危险：API Key 将以明文写入 JSON', 'Risky: API keys will be written to plaintext JSON')}</small></span>
              </label>
              <div className={includeCredentials ? 'onmi-data-note warning' : 'onmi-data-note'}>
                {includeCredentials ? <ShieldAlert size={13} /> : <KeyRound size={13} />}
                <span>{includeCredentials ? copy('导出时还会要求二次确认。', 'A second confirmation is required before export.') : copy('默认导出已剔除凭证字段。', 'Credential fields are removed from default exports.')}</span>
              </div>
              <button type="button" className="onmi-btn primary" onClick={() => void handleExport()} disabled={isExporting || previewState !== 'ready'}>
                <Download size={13} /> {isExporting ? copy('生成中...', 'Building...') : copy('生成 ONMI v2 备份', 'Build ONMI v2 backup')}
              </button>
            </div>
          </div>

          <div className="onmi-data-card">
            <div className="onmi-data-card-head"><Upload size={15} /><strong>{copy('导入 · IMPORT', 'Import · IMPORT')}</strong><span className="onmi-mono">← .json</span></div>
            <div className="onmi-data-card-body">
              <button type="button" className="onmi-drop-zone" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                <FileUp size={24} /><strong>{copy('选择备份文件', 'Choose backup file')}</strong><span className="onmi-mono">JSON · ONMI backup v1/v2</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={(event) => void handleFileSelect(event)} hidden />

              {importCandidate && (
                <div className="onmi-import-candidate" role="status">
                  <strong>{importCandidate.name}</strong>
                  <span>v{importCandidate.data.version} · {copy('文件内容', 'file contents')}: {importCandidate.conversations} conv · {importCandidate.messages} msg · {importCandidate.providers} cfg</span>
                  <span>
                    {copy('导入后估算', 'estimated after import')}: {preview?.stats.conversations ?? 0} → {mergeMode === 'replace' ? importCandidate.conversations : `~${(preview?.stats.conversations ?? 0) + importCandidate.conversations}`} conv ·{' '}
                    {preview?.stats.messages ?? 0} → {mergeMode === 'replace' ? importCandidate.messages : `~${(preview?.stats.messages ?? 0) + importCandidate.messages}`} msg ·{' '}
                    {preview?.stats.aiProviders ?? 0} → {mergeMode === 'replace' ? importCandidate.providers : `~${(preview?.stats.aiProviders ?? 0) + importCandidate.providers}`} cfg
                  </span>
                  <span className={importCandidate.hasCredentials ? 'warning' : 'safe'}>
                    {importCandidate.hasCredentials ? copy('检测到 Provider 凭证；文件将新增或覆盖凭证', 'Provider credentials detected; the file will add or replace credentials') : copy('未检测到 Provider 凭证；凭证变化：无', 'No provider credentials detected; credential change: none')}
                  </span>
                </div>
              )}

              <OnmiRule>{copy('导入策略', 'Import strategy')}</OnmiRule>
              <div className="onmi-merge-grid">
                <button type="button" className={mergeMode === 'merge' ? 'active' : ''} onClick={() => setMergeMode('merge')}><strong>{copy('合并', 'Merge')}</strong><span>{copy('保留现有数据', 'Keep existing data')}</span></button>
                <button type="button" className={mergeMode === 'replace' ? 'active' : ''} onClick={() => setMergeMode('replace')}><strong>{copy('覆盖', 'Replace')}</strong><span>{copy('清空再写入，需要确认', 'Wipe then write; confirmation required')}</span></button>
              </div>
              <button type="button" className="onmi-btn primary" disabled={!importCandidate || isImporting} onClick={() => void handleImport()}>
                <Upload size={13} /> {isImporting ? copy('导入中...', 'Importing...') : copy('确认导入预览内容', 'Import previewed content')}
              </button>
            </div>
          </div>
        </section>

        <section className="onmi-data-health onmi-card">
          <div className="onmi-data-health-head">
            <OnmiRule>{copy('只读数据健康报告', 'Read-only data health report')}</OnmiRule>
            <button type="button" className="onmi-btn ghost" onClick={() => void loadHealth()} disabled={healthState === 'loading'}><RefreshCw size={11} className={healthState === 'loading' ? 'animate-spin' : ''} /> {copy('刷新', 'Refresh')}</button>
          </div>
          {healthState === 'error' ? <LoadError message={healthError} onRetry={() => void loadHealth()} copy={copy} /> : healthState === 'loading' ? (
            <div className="onmi-health-loading" role="status"><RefreshCw size={16} className="animate-spin" /> {copy('正在读取数据库状态...', 'Reading database status...')}</div>
          ) : health && (
            <div className="onmi-health-grid">
              <HealthItem icon={<Database size={14} />} label={copy('数据库版本', 'Database version')} value={`${health.dbVersion} / ${health.currentVersion}`} />
              <HealthItem icon={<RefreshCw size={14} />} label={copy('待迁移', 'Pending migrations')} value={health.pendingMigrations.length ? health.pendingMigrations.join(', ') : copy('无', 'None')} />
              <HealthItem icon={<AlertTriangle size={14} />} label={copy('孤儿数据', 'Orphan data')} value={`${health.integrity.orphanMessages} msg · ${health.integrity.orphanConversations} conv`} />
              <HealthItem icon={<AlertTriangle size={14} />} label={copy('重复标识', 'Duplicate identifiers')} value={`${health.integrity.duplicateUsernames} users · ${health.integrity.duplicateIds} ids`} />
              <HealthItem icon={<HardDrive size={14} />} label={copy('最近数据库备份', 'Latest database backup')} value={health.latestBackup ? `${health.latestBackup.filename} · ${formatBytes(health.latestBackup.sizeBytes)}` : copy('尚无记录', 'No backup recorded')} />
            </div>
          )}
        </section>
      </div>
    </OnmiPageShell>
  );
}

function LoadError({ message, onRetry, copy }: { message: string | null; onRetry: () => void; copy: (zh: string, en: string) => string }) {
  return <div className="onmi-data-error" role="alert"><AlertTriangle size={14} /><span>{message || copy('加载失败', 'Load failed')}</span><button type="button" onClick={onRetry}>{copy('重试', 'Retry')}</button></div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="onmi-metric-card"><div className="onmi-section-label">{label}</div><strong>{value}</strong><span className="onmi-mono">local</span></div>;
}

function DataOption({ label, value, enabled = false }: { label: string; value: string; enabled?: boolean }) {
  return <div className="onmi-data-option"><span className={enabled ? 'enabled' : ''}>{enabled && <Check size={9} />}</span><strong>{label}</strong><em className="onmi-mono">{value}</em></div>;
}

function HealthItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="onmi-health-item"><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
