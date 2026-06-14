import { describe, expect, it } from 'vitest';
import { calculateLocalUsageStats, type UsageConversation, type UsageLimits, type UsageMessage } from '../usage-stats';

const limits: UsageLimits = {
  dailyRequests: 5,
  monthlyRequests: 10,
  maxTokensPerRequest: 4000,
  concurrentRequests: 1,
};

describe('calculateLocalUsageStats', () => {
  it('derives local usage from conversations and messages', () => {
    const now = new Date('2026-06-11T16:00:00.000Z');
    const conversations: UsageConversation[] = [
      {
        id: 'conv-openai',
        provider_used: 'openai',
        model_used: 'gpt-4o-mini',
        created_at: '2026-06-11T15:00:00.000Z',
      },
      {
        id: 'conv-gemini',
        provider_used: 'gemini',
        model_used: 'gemini-2.5-flash',
        created_at: '2026-06-11T15:10:00.000Z',
      },
    ];
    const messages: UsageMessage[] = [
      {
        conversation_id: 'conv-openai',
        role: 'user',
        content: '12345678',
        created_at: '2026-06-11T15:01:00.000Z',
      },
      {
        conversation_id: 'conv-openai',
        role: 'assistant',
        content: 'assistant answer',
        output_tokens: 30,
        created_at: '2026-06-11T15:02:00.000Z',
      },
      {
        conversation_id: 'conv-gemini',
        role: 'user',
        content: 'abcd',
        provider: 'gemini',
        created_at: '2026-06-11T15:11:00.000Z',
      },
      {
        conversation_id: 'conv-openai',
        role: 'user',
        content: 'older request',
        created_at: '2026-05-15T15:00:00.000Z',
      },
      {
        conversation_id: 'missing',
        role: 'user',
        content: 'bad date is ignored',
        created_at: 'not-a-date',
      },
    ];

    const stats = calculateLocalUsageStats(conversations, messages, limits, now);

    expect(stats.estimated).toBe(true);
    expect(stats.current.daily).toBe(2);
    expect(stats.current.monthly).toBe(2);
    expect(stats.current.tokens).toBe(33);
    expect(stats.remaining).toEqual({ daily: 3, monthly: 8 });
    expect(stats.daily).toHaveLength(30);

    const today = stats.daily.find((day) => day.date === '2026-06-11');
    expect(today).toMatchObject({ requests: 2, messages: 3, tokens: 33 });

    const openai = stats.providers.find((provider) => provider.provider === 'openai');
    expect(openai).toMatchObject({
      requests: 1,
      messages: 2,
      conversations: 1,
      inputTokens: 2,
      outputTokens: 30,
      totalTokens: 32,
    });
    expect(openai?.models).toContain('gpt-4o-mini');

    const gemini = stats.providers.find((provider) => provider.provider === 'gemini');
    expect(gemini).toMatchObject({
      requests: 1,
      messages: 1,
      conversations: 1,
      inputTokens: 1,
      totalTokens: 1,
    });
  });

  it('keeps unlimited limits as unlimited remaining values', () => {
    const stats = calculateLocalUsageStats([], [], {
      ...limits,
      dailyRequests: -1,
      monthlyRequests: -1,
    }, new Date('2026-06-11T16:00:00.000Z'));

    expect(stats.remaining.daily).toBe(-1);
    expect(stats.remaining.monthly).toBe(-1);
    expect(stats.providers).toEqual([]);
  });
});
