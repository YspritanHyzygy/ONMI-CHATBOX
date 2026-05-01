import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowUpRight, BarChart3, Clock, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { OnmiPageShell, OnmiStaticSidebar } from '@/components/onmi/OnmiShell';
import { OnmiRule, ProviderGlyph } from '@/components/onmi/OnmiPrimitives';
import { getProviderName } from '@/components/onmi/providerMeta';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { fetchWithAuth } from '@/lib/fetch';
import { getUserId } from '@/lib/user';
import useAuthStore from '@/store/authStore';

interface UsageStats {
  current: {
    daily: number;
    monthly: number;
    tokens: number;
  };
  limits: {
    dailyRequests: number;
    monthlyRequests: number;
    maxTokensPerRequest: number;
    concurrentRequests: number;
  };
  remaining: {
    daily: number;
    monthly: number;
  };
}

const PROVIDER_ROWS = [
  { id: 'openai', spend: 8.12, req: 1840, input: '0.94M', output: '0.18M', url: 'platform.openai.com/usage' },
  { id: 'claude', spend: 6.04, req: 1212, input: '0.62M', output: '0.14M', url: 'console.anthropic.com/usage' },
  { id: 'gemini', spend: 0.86, req: 920, input: '0.22M', output: '0.08M', url: 'aistudio.google.com' },
  { id: 'xai', spend: 3.4, req: 246, input: '0.06M', output: '0.02M', url: 'console.x.ai' },
];

export default function UsagePage() {
  const copy = useOnmiCopy();
  const user = useAuthStore((state) => state.user);
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 900;
  });
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userId = user?.id || getUserId();

  useEffect(() => {
    let cancelled = false;
    async function loadUsage() {
      try {
        setIsLoading(true);
        const response = await fetchWithAuth(`/api/business/usage/${userId}`);
        const result = await response.json();
        if (!cancelled && result.success) {
          setUsage(result.data);
        }
      } catch {
        if (!cancelled) setUsage(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadUsage();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const days = useMemo(() => Array.from({ length: 30 }, (_, index) => ({
    day: index,
    value: 0.2 + Math.abs(Math.sin(index * 0.6) * 0.6) + (index > 22 ? 0.5 : 0) + (index % 7 < 2 ? -0.15 : 0.1),
    provider: PROVIDER_ROWS[index % PROVIDER_ROWS.length].id,
  })), []);
  const max = Math.max(...days.map((day) => day.value));
  const monthlyLimit = usage?.limits.monthlyRequests ?? 1000;
  const dailyLimit = usage?.limits.dailyRequests ?? 100;

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          provider="openai"
          modelLabel="LOCAL METER"
          status="LOCAL · METER"
          onCommand={() => toast.info(copy('命令面板是占位功能。', 'Command palette is a placeholder.'))}
        />
      }
      sidebar={<OnmiStaticSidebar activeId="usage" />}
    >
      <div className="onmi-usage onmi-scroll">
        <div className="onmi-page-header onmi-usage-header">
          <div>
            <div className="onmi-section-label">LOCAL · 05 · USAGE METER</div>
            <h1>{copy('本地用量 · 直付 Provider', 'Local usage · pay providers directly')}</h1>
            <p>
              {copy(
                '这些数字来自当前项目的本地/后端估算接口。真实账单以各 Provider 官方控制台为准。',
                'These numbers come from the app local/backend estimate endpoint. Official provider dashboards remain authoritative.'
              )}
            </p>
          </div>
          <div className="onmi-window-chip onmi-mono">
            <Clock size={13} />
            <span>WINDOW</span>
            <b>{formatWindow()}</b>
          </div>
        </div>

        <section className="onmi-usage-kpis">
          <UsageKpi icon={<DollarSign size={15} />} label={copy('估算花费 · 30天', 'Est. spend · 30d')} value="$18.42" sub={copy('支付给 Provider', 'paid to providers')} accent />
          <UsageKpi icon={<Activity size={15} />} label={copy('请求', 'Requests')} value={usage ? usage.current.monthly.toLocaleString() : isLoading ? '...' : '0'} sub={`${monthlyLimit.toLocaleString()} limit`} />
          <UsageKpi icon={<BarChart3 size={15} />} label={copy('今日请求', 'Daily requests')} value={usage ? usage.current.daily.toLocaleString() : isLoading ? '...' : '0'} sub={`${dailyLimit.toLocaleString()} limit`} />
          <UsageKpi icon={<ArrowUpRight size={15} />} label="Tokens" value={usage ? usage.current.tokens.toLocaleString() : isLoading ? '...' : '0'} sub={copy('本地估算', 'local estimate')} />
        </section>

        <section className="onmi-usage-chart onmi-card">
          <div className="onmi-chart-head">
            <OnmiRule>{copy('每日估算花费 · 按 Provider 分色', 'Daily est. spend · by provider')}</OnmiRule>
            <div className="onmi-chart-legend">
              {PROVIDER_ROWS.map((provider) => (
                <span key={provider.id}>
                  <i style={{ background: `var(--p-${provider.id})` }} />
                  <b className="onmi-mono">{provider.id}</b>
                </span>
              ))}
            </div>
          </div>
          <div className="onmi-bars">
            {days.map((day) => (
              <span key={day.day} title={`${day.provider}: $${day.value.toFixed(2)}`}>
                <i style={{ height: `${(day.value / max) * 100}%`, background: `var(--p-${day.provider})` }} />
              </span>
            ))}
          </div>
          <div className="onmi-axis onmi-mono">
            <span>MAR 29</span>
            <span>APR 05</span>
            <span>APR 12</span>
            <span>APR 19</span>
            <span>APR 28 · today</span>
          </div>
        </section>

        <section className="onmi-provider-usage onmi-card">
          <div className="onmi-provider-usage-head">
            <OnmiRule>{copy('按 Provider 拆分 · 官方账单占位链接', 'Per-provider · official billing placeholders')}</OnmiRule>
          </div>
          {PROVIDER_ROWS.map((row) => (
            <div className="onmi-provider-usage-row" key={row.id}>
              <ProviderGlyph provider={row.id} size={30} />
              <span>
                <strong>{getProviderName(row.id)}</strong>
                <small className="onmi-mono">{row.url} ↗</small>
                <i><b style={{ width: `${(row.spend / 8.12) * 100}%`, background: `var(--p-${row.id})` }} /></i>
              </span>
              <code>${row.spend.toFixed(2)}</code>
              <code>{row.req} req</code>
              <code>{row.input} in</code>
              <code>{row.output} out</code>
            </div>
          ))}
        </section>
      </div>
    </OnmiPageShell>
  );
}

function UsageKpi({ icon, label, value, sub, accent = false }: { icon: ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="onmi-metric-card onmi-usage-kpi">
      <div className="onmi-section-label">{icon}{label}</div>
      <strong className={accent ? 'accent' : ''}>{value}</strong>
      <span className="onmi-mono">{sub}</span>
    </div>
  );
}

function formatWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);
  return `${start.toISOString().slice(0, 10)} -> ${end.toISOString().slice(0, 10)}`;
}
