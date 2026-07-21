import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Clock, DollarSign, RefreshCw } from 'lucide-react';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { OnmiPageShell, OnmiStaticSidebar } from '@/components/onmi/OnmiShell';
import { OnmiRule, ProviderGlyph } from '@/components/onmi/OnmiPrimitives';
import { getProviderName } from '@/components/onmi/providerMeta';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar';
import { fetchWithAuth } from '@/lib/fetch';
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
  estimated?: boolean;
  providers?: ProviderUsage[];
  daily?: DailyUsage[];
}

interface ProviderUsage {
  provider: string;
  requests: number;
  messages: number;
  conversations: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  models: string[];
  lastUsed?: string;
}

interface DailyUsage {
  date: string;
  requests: number;
  messages: number;
  tokens: number;
}

export default function UsagePage() {
  const copy = useOnmiCopy();
  const user = useAuthStore((state) => state.user);
  const { showSidebar, setShowSidebar } = useResponsiveSidebar();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const userId = user?.id;

  const loadUsage = useCallback(async (signal?: AbortSignal) => {
    if (!userId) {
      setUsage(null);
      setLoadError(copy('请先登录', 'Please sign in first'));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetchWithAuth(`/api/business/usage/${encodeURIComponent(userId)}`, { signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || copy('用量加载失败', 'Failed to load usage'));
      setUsage(result.data);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : copy('用量加载失败', 'Failed to load usage'));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [copy, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsage(controller.signal);
    return () => controller.abort();
  }, [loadUsage]);

  const providers = usage?.providers ?? [];
  const days = useMemo(() => usage?.daily ?? buildEmptyDailySeries(), [usage?.daily]);
  const axisLabels = useMemo(() => buildAxisLabels(), []);
  const max = Math.max(1, ...days.map((day) => day.requests));
  const monthlyLimit = usage?.limits.monthlyRequests ?? -1;
  const dailyLimit = usage?.limits.dailyRequests ?? -1;

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          modelLabel="LOCAL METER"
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

        {loadError && (
          <div className="onmi-data-error" role="alert">
            <AlertTriangle size={14} />
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadUsage()}><RefreshCw size={11} /> {copy('重试', 'Retry')}</button>
          </div>
        )}

        <section className="onmi-usage-kpis">
          <UsageKpi icon={<Activity size={15} />} label={copy('本月请求', 'Monthly requests')} value={usage ? usage.current.monthly.toLocaleString() : isLoading ? '...' : '—'} sub={formatLimit(monthlyLimit)} accent />
          <UsageKpi icon={<BarChart3 size={15} />} label={copy('今日请求', 'Daily requests')} value={usage ? usage.current.daily.toLocaleString() : isLoading ? '...' : '—'} sub={formatLimit(dailyLimit)} />
          <UsageKpi icon={<ArrowUpRight size={15} />} label={copy('估算 tokens', 'Estimated tokens')} value={usage ? usage.current.tokens.toLocaleString() : isLoading ? '...' : '—'} sub={usage?.estimated ? copy('按本地消息长度估算', 'estimated from local message text') : copy('本地统计', 'local count')} />
          <UsageKpi icon={<DollarSign size={15} />} label={copy('账单', 'Billing')} value={copy('外部', 'External')} sub={copy('以 Provider 官方后台为准', 'provider dashboards are authoritative')} />
        </section>

        <section className="onmi-usage-chart onmi-card">
          <div className="onmi-chart-head">
            <OnmiRule>{copy('每日本地请求', 'Daily local requests')}</OnmiRule>
            <div className="onmi-chart-legend">
              {loadError ? (
                <span><b className="onmi-mono">{copy('数据不可用', 'Data unavailable')}</b></span>
              ) : providers.length === 0 ? (
                <span><b className="onmi-mono">{copy('暂无 Provider 数据', 'No provider data yet')}</b></span>
              ) : providers.map((provider) => (
                <span key={provider.provider}>
                  <i style={{ background: providerColor(provider.provider) }} />
                  <b className="onmi-mono">{provider.provider}</b>
                </span>
              ))}
            </div>
          </div>
          {loadError ? (
            <div className="onmi-session-empty"><AlertTriangle size={22} /><span>{copy('无法绘制用量图表', 'Usage chart unavailable')}</span></div>
          ) : (
            <>
              <div className="onmi-bars">
                {days.map((day) => (
                  <span key={day.date} title={`${day.date}: ${day.requests} req, ${day.tokens} est. tokens`}>
                    <i style={{ height: `${(day.requests / max) * 100}%`, background: 'var(--sig)' }} />
                  </span>
                ))}
              </div>
              <div className="onmi-axis onmi-mono">
                {axisLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
            </>
          )}
        </section>

        <section className="onmi-provider-usage onmi-card">
          <div className="onmi-provider-usage-head">
            <OnmiRule>{copy('按 Provider 拆分', 'Per-provider local breakdown')}</OnmiRule>
          </div>
          {loadError ? (
            <div className="onmi-session-empty"><AlertTriangle size={22} /><span>{copy('用量数据当前不可用', 'Usage data is currently unavailable')}</span></div>
          ) : providers.length === 0 ? (
            <div className="onmi-session-empty">
              <Activity size={22} />
              <span>{copy('还没有本地用量数据', 'No local usage data yet')}</span>
            </div>
          ) : providers.map((row) => (
            <div className="onmi-provider-usage-row" key={row.provider}>
              <ProviderGlyph provider={row.provider} size={30} />
              <span>
                <strong>{getProviderName(row.provider)}</strong>
                <small className="onmi-mono">{row.conversations} sessions · {row.messages} messages · estimated</small>
                <i><b style={{ width: `${providerShare(row.totalTokens, providers)}%`, background: providerColor(row.provider) }} /></i>
              </span>
              <code>{row.requests} req</code>
              <code>{formatCompact(row.inputTokens)} in</code>
              <code>{formatCompact(row.outputTokens)} out</code>
              <code>{formatCompact(row.totalTokens)} tok</code>
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

function buildAxisLabels() {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' });
  return [29, 22, 15, 8, 0].map((daysAgo, index) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const label = formatter.format(date).toUpperCase();
    return index === 4 ? `${label} · today` : label;
  });
}

function buildEmptyDailySeries(): DailyUsage[] {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return {
      date: date.toISOString().slice(0, 10),
      requests: 0,
      messages: 0,
      tokens: 0,
    };
  });
}

function formatLimit(limit: number) {
  return limit < 0 ? 'no local limit' : `${limit.toLocaleString()} limit`;
}

function providerColor(provider: string) {
  return `var(--p-${provider}, var(--sig))`;
}

function providerShare(tokens: number, providers: ProviderUsage[]) {
  const maxTokens = Math.max(1, ...providers.map((provider) => provider.totalTokens));
  return Math.max(4, (tokens / maxTokens) * 100);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
