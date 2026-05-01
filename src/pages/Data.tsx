import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, Database, Download, FileUp, KeyRound, Upload } from 'lucide-react';
import { toast } from 'sonner';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { OnmiPageShell, OnmiStaticSidebar } from '@/components/onmi/OnmiShell';
import { OnmiRule } from '@/components/onmi/OnmiPrimitives';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { fetchWithAuth } from '@/lib/fetch';
import { getUserId } from '@/lib/user';
import useAuthStore from '@/store/authStore';

interface DataPreview {
  user: {
    username: string;
    displayName?: string;
    created_at: string;
  };
  stats: {
    conversations: number;
    messages: number;
    aiProviders: number;
  };
}

type MergeMode = 'merge' | 'replace';

export default function DataPage() {
  const copy = useOnmiCopy();
  const user = useAuthStore((state) => state.user);
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 900;
  });
  const [preview, setPreview] = useState<DataPreview | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>('merge');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const userId = user?.id || getUserId();

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      try {
        const response = await fetchWithAuth(`/api/data/preview/${userId}`);
        const result = await response.json();
        if (!cancelled && result.success) {
          setPreview(result.data);
        }
      } catch {
        if (!cancelled) setPreview(null);
      }
    }
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetchWithAuth(`/api/data/export/${userId}`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || copy('导出失败', 'Export failed'));
      }
      const dataStr = JSON.stringify(result.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `onmi-chatbox-${preview?.user.username || user?.username || 'backup'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(copy('数据已导出', 'Data exported'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy('导出失败', 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);
      if (!importData.version) {
        throw new Error(copy('无效的备份文件格式', 'Invalid backup file format'));
      }
      const response = await fetchWithAuth(`/api/data/import/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: importData, mergeMode }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || copy('导入失败', 'Import failed'));
      }
      toast.success(copy('数据导入完成', 'Data import complete'));
      const previewResponse = await fetchWithAuth(`/api/data/preview/${userId}`);
      const previewResult = await previewResponse.json();
      if (previewResult.success) setPreview(previewResult.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy('导入失败', 'Import failed'));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          provider="gemini"
          modelLabel="DATA TRANSFER"
          status="DATA · I/O"
          onCommand={() => toast.info(copy('命令面板是占位功能。', 'Command palette is a placeholder.'))}
        />
      }
      sidebar={<OnmiStaticSidebar activeId="data" />}
    >
      <div className="onmi-data onmi-scroll">
        <div className="onmi-page-header">
          <div className="onmi-section-label">CONFIG · 04 · DATA TRANSFER</div>
          <h1>{copy('数据传输 · 导入导出', 'Data transfer · Import/Export')}</h1>
          <p>
            {copy(
              '导出与导入继续使用项目现有 JSON 数据接口；加密 .onmi.zip 与跨应用格式识别先作为占位能力显示。',
              'Export and import keep using the existing JSON data APIs. Encrypted .onmi.zip and cross-app format detection are shown as placeholders.'
            )}
          </p>
        </div>

        <section className="onmi-data-stats">
          <Stat label={copy('会话', 'Sessions')} value={preview?.stats.conversations ?? 0} />
          <Stat label={copy('消息', 'Messages')} value={preview?.stats.messages ?? 0} />
          <Stat label={copy('Provider 配置', 'Provider configs')} value={preview?.stats.aiProviders ?? 0} />
          <Stat label={copy('备份格式', 'Backup format')} value="JSON" />
        </section>

        <section className="onmi-data-grid">
          <div className="onmi-data-card">
            <div className="onmi-data-card-head">
              <Download size={15} />
              <strong>{copy('导出 · EXPORT', 'Export · EXPORT')}</strong>
              <span className="onmi-mono">→ .json</span>
            </div>
            <div className="onmi-data-card-body">
              <OnmiRule>{copy('包含内容', 'Include')}</OnmiRule>
              <DataOption label={copy('全部会话', 'All sessions')} value={`${preview?.stats.conversations ?? 0} conv`} enabled />
              <DataOption label={copy('全部消息', 'All messages')} value={`${preview?.stats.messages ?? 0} msg`} enabled />
              <DataOption label={copy('API 凭证配置', 'API credential config')} value={`${preview?.stats.aiProviders ?? 0} cfg`} enabled />
              <DataOption label={copy('提示词模板', 'Prompt templates')} value={copy('占位', 'placeholder')} />
              <div className="onmi-data-note">
                <KeyRound size={13} />
                <span>{copy('加密 .onmi.zip 备份暂未接入，当前导出为 JSON。', 'Encrypted .onmi.zip backup is not wired yet; current export is JSON.')}</span>
              </div>
              <button type="button" className="onmi-btn primary" onClick={handleExport} disabled={isExporting}>
                <Download size={13} />
                {isExporting ? copy('生成中...', 'Building...') : copy('生成 ONMI JSON 备份', 'Build ONMI JSON backup')}
              </button>
            </div>
          </div>

          <div className="onmi-data-card">
            <div className="onmi-data-card-head">
              <Upload size={15} />
              <strong>{copy('导入 · IMPORT', 'Import · IMPORT')}</strong>
              <span className="onmi-mono">← .json</span>
            </div>
            <div className="onmi-data-card-body">
              <button type="button" className="onmi-drop-zone" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                <FileUp size={24} />
                <strong>{isImporting ? copy('导入中...', 'Importing...') : copy('选择备份文件', 'Choose backup file')}</strong>
                <span className="onmi-mono">JSON · ONMI backup schema v1</span>
              </button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileSelect} hidden />

              <OnmiRule>{copy('合并策略', 'Merge strategy')}</OnmiRule>
              <div className="onmi-merge-grid">
                <button type="button" className={mergeMode === 'merge' ? 'active' : ''} onClick={() => setMergeMode('merge')}>
                  <strong>{copy('合并', 'Merge')}</strong>
                  <span>{copy('保留现有数据', 'Keep existing data')}</span>
                </button>
                <button type="button" className={mergeMode === 'replace' ? 'active' : ''} onClick={() => setMergeMode('replace')}>
                  <strong>{copy('覆盖', 'Replace')}</strong>
                  <span>{copy('清空再写入', 'Wipe then write')}</span>
                </button>
              </div>

              <div className="onmi-import-preview">
                <Database size={14} />
                <span>{copy('ChatGPT/Claude 导入识别暂未接入；当前只接受本项目导出的 JSON。', 'ChatGPT/Claude import detection is not wired yet; only this app JSON export is accepted.')}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </OnmiPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="onmi-metric-card">
      <div className="onmi-section-label">{label}</div>
      <strong>{value}</strong>
      <span className="onmi-mono">local</span>
    </div>
  );
}

function DataOption({ label, value, enabled = false }: { label: string; value: string; enabled?: boolean }) {
  return (
    <div className="onmi-data-option">
      <span className={enabled ? 'enabled' : ''}>{enabled && <Check size={9} />}</span>
      <strong>{label}</strong>
      <em className="onmi-mono">{value}</em>
    </div>
  );
}
