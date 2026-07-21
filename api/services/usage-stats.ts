export interface UsageConversation {
  id: string;
  provider_used?: string;
  model_used?: string;
  created_at: string;
}

export interface UsageMessage {
  conversation_id: string;
  content?: string;
  role?: string;
  provider?: string;
  model?: string;
  model_provider?: string;
  output_tokens?: number;
  created_at: string;
}

export interface UsageLimits {
  dailyRequests: number;
  monthlyRequests: number;
  maxTokensPerRequest: number;
  concurrentRequests: number;
}

export interface ProviderUsageSummary {
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

export interface DailyUsageSummary {
  date: string;
  requests: number;
  messages: number;
  tokens: number;
}

export interface LocalUsageStats {
  current: {
    daily: number;
    monthly: number;
    tokens: number;
  };
  limits: UsageLimits;
  remaining: {
    daily: number;
    monthly: number;
  };
  resetDate: {
    daily: string;
    monthly: string;
  };
  estimated: true;
  providers: ProviderUsageSummary[];
  daily: DailyUsageSummary[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function estimateTokens(content?: string) {
  if (!content) return 0;
  return Math.max(1, Math.ceil(content.length / 4));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createProviderSummary(provider: string): ProviderUsageSummary {
  return {
    provider,
    requests: 0,
    messages: 0,
    conversations: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    models: [],
  };
}

function createDailySeries(now: Date) {
  const start = startOfDay(new Date(now.getTime() - 29 * DAY_MS));
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    return {
      date: formatDateKey(date),
      requests: 0,
      messages: 0,
      tokens: 0,
    };
  });
}

export function calculateLocalUsageStats(
  conversations: UsageConversation[],
  messages: UsageMessage[],
  limits: UsageLimits,
  now = new Date(),
): LocalUsageStats {
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const dailyStart = startOfDay(new Date(now.getTime() - 29 * DAY_MS));
  const nextDay = new Date(todayStart.getTime() + DAY_MS);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const providerSummaries = new Map<string, ProviderUsageSummary>();
  const providerConversationIds = new Map<string, Set<string>>();
  const daily = createDailySeries(now);
  const dailyByDate = new Map(daily.map((entry) => [entry.date, entry]));

  let dailyRequests = 0;
  let monthlyRequests = 0;
  let monthlyTokens = 0;

  for (const message of messages) {
    const created = new Date(message.created_at);
    if (Number.isNaN(created.getTime())) continue;

    const conversation = conversationsById.get(message.conversation_id);
    const provider = message.provider || message.model_provider || conversation?.provider_used || 'unknown';
    const model = message.model || conversation?.model_used;
    const isUserMessage = message.role === 'user';
    const isAssistantMessage = message.role === 'assistant';
    const inputTokens = isUserMessage ? estimateTokens(message.content) : 0;
    const outputTokens = isAssistantMessage
      ? (typeof message.output_tokens === 'number' ? message.output_tokens : estimateTokens(message.content))
      : 0;
    const totalTokens = inputTokens + outputTokens;

    if (created >= todayStart && isUserMessage) {
      dailyRequests += 1;
    }

    if (created >= monthStart) {
      monthlyTokens += totalTokens || estimateTokens(message.content);
      if (isUserMessage) monthlyRequests += 1;

      const summary = providerSummaries.get(provider) || createProviderSummary(provider);
      summary.messages += 1;
      summary.requests += isUserMessage ? 1 : 0;
      summary.inputTokens += inputTokens;
      summary.outputTokens += outputTokens;
      summary.totalTokens += totalTokens || estimateTokens(message.content);
      if (model && !summary.models.includes(model)) {
        summary.models.push(model);
      }
      if (!summary.lastUsed || created > new Date(summary.lastUsed)) {
        summary.lastUsed = created.toISOString();
      }
      providerSummaries.set(provider, summary);

      if (conversation) {
        const ids = providerConversationIds.get(provider) || new Set<string>();
        ids.add(conversation.id);
        providerConversationIds.set(provider, ids);
      }
    }

    if (created >= dailyStart) {
      const day = dailyByDate.get(formatDateKey(created));
      if (day) {
        day.messages += 1;
        day.requests += isUserMessage ? 1 : 0;
        day.tokens += totalTokens || estimateTokens(message.content);
      }
    }
  }

  for (const [provider, ids] of providerConversationIds) {
    const summary = providerSummaries.get(provider);
    if (summary) summary.conversations = ids.size;
  }

  const remainingDaily = limits.dailyRequests < 0 ? -1 : Math.max(0, limits.dailyRequests - dailyRequests);
  const remainingMonthly = limits.monthlyRequests < 0 ? -1 : Math.max(0, limits.monthlyRequests - monthlyRequests);

  return {
    current: {
      daily: dailyRequests,
      monthly: monthlyRequests,
      tokens: monthlyTokens,
    },
    limits,
    remaining: {
      daily: remainingDaily,
      monthly: remainingMonthly,
    },
    resetDate: {
      daily: nextDay.toISOString(),
      monthly: nextMonth.toISOString(),
    },
    estimated: true,
    providers: Array.from(providerSummaries.values())
      .sort((a, b) => b.requests - a.requests || b.totalTokens - a.totalTokens),
    daily,
  };
}
