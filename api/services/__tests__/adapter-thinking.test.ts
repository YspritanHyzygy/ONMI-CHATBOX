/**
 * Extended-thinking behavior of the provider adapters:
 * - Claude: thinking request param + constraints, thinking/signature deltas
 * - Ollama: think flag, native thinking channel, <think> tag fallback
 * - xAI: reasoning_effort gating and reasoning_content extraction
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIServiceConfig, ChatMessage, StreamResponse } from '../types';

const messages: ChatMessage[] = [{ role: 'user', content: 'why is the sky blue?' }];

async function collect(gen: AsyncGenerator<StreamResponse>): Promise<StreamResponse[]> {
  const out: StreamResponse[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

/* ------------------------------ Claude ------------------------------ */

const anthropicCreateMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreateMock };
  }
}));

/* ------------------------------- xAI -------------------------------- */

const openaiCreateMock = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreateMock } };
  }
}));

import { ClaudeAdapter } from '../claude-adapter';
import { XAIAdapter } from '../xai-adapter';
import { OllamaAdapter } from '../ollama-adapter';

function claudeConfig(overrides: Partial<AIServiceConfig> = {}): AIServiceConfig {
  return {
    provider: 'claude',
    apiKey: 'k',
    model: 'claude-sonnet-5',
    temperature: 0.7,
    topP: 0.9,
    ...overrides
  } as AIServiceConfig;
}

describe('ClaudeAdapter thinking', () => {
  beforeEach(() => anthropicCreateMock.mockReset());

  it('sends the thinking param, strips temperature/top_p, and keeps max_tokens above the budget', async () => {
    anthropicCreateMock.mockResolvedValue({
      model: 'claude-sonnet-5',
      content: [
        { type: 'thinking', thinking: 'let me think...', signature: 'sig-1' },
        { type: 'text', text: 'Rayleigh scattering.' }
      ],
      usage: { input_tokens: 10, output_tokens: 20 }
    });

    const result = await new ClaudeAdapter().chat(messages, claudeConfig({
      enableThinking: true,
      thinkingBudget: 2048,
      maxTokens: 1000
    }));

    const params = anthropicCreateMock.mock.calls[0][0];
    expect(params.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
    expect(params.temperature).toBeUndefined();
    expect(params.top_p).toBeUndefined();
    expect(params.max_tokens).toBeGreaterThan(2048);
    expect(result.content).toBe('Rayleigh scattering.');
    expect(result.thinking).toEqual({ content: 'let me think...', signature: 'sig-1' });
  });

  it('does not touch the request when thinking is disabled', async () => {
    anthropicCreateMock.mockResolvedValue({
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 }
    });

    await new ClaudeAdapter().chat(messages, claudeConfig());

    const params = anthropicCreateMock.mock.calls[0][0];
    expect(params.thinking).toBeUndefined();
    expect(params.temperature).toBe(0.7);
  });

  it('yields thinking and signature deltas from the stream', async () => {
    anthropicCreateMock.mockResolvedValue((async function* () {
      yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm ' } };
      yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'scattering' } };
      yield { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'sig-2' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Blue light scatters.' } };
      yield { type: 'message_stop' };
    })());

    const chunks = await collect(new ClaudeAdapter().streamChat(messages, claudeConfig({ enableThinking: true })));

    const thinkingText = chunks.map(c => c.thinking?.content || '').join('');
    expect(thinkingText).toBe('hmm scattering');
    expect(chunks.some(c => c.thinking?.signature === 'sig-2')).toBe(true);
    expect(chunks.map(c => c.content).join('')).toBe('Blue light scatters.');
    expect(chunks.at(-1)?.done).toBe(true);
  });
});

describe('XAIAdapter thinking', () => {
  beforeEach(() => openaiCreateMock.mockReset());

  function xaiConfig(overrides: Partial<AIServiceConfig> = {}): AIServiceConfig {
    return { provider: 'xai', apiKey: 'k', model: 'grok-3-mini', ...overrides } as AIServiceConfig;
  }

  it('sends reasoning_effort only for adjustable models', async () => {
    openaiCreateMock.mockResolvedValue({
      model: 'grok-3-mini',
      choices: [{ message: { content: 'ok', reasoning_content: 'thought about it' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    });

    const result = await new XAIAdapter().chat(messages, xaiConfig({ enableThinking: true, reasoningEffort: 'high' }));
    expect(openaiCreateMock.mock.calls[0][0].reasoning_effort).toBe('high');
    expect(result.thinking?.content).toBe('thought about it');

    openaiCreateMock.mockClear();
    openaiCreateMock.mockResolvedValue({
      model: 'grok-4.5',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    });
    await new XAIAdapter().chat(messages, xaiConfig({ model: 'grok-4.5', enableThinking: true, reasoningEffort: 'high' }));
    expect(openaiCreateMock.mock.calls[0][0].reasoning_effort).toBeUndefined();
  });

  it('yields reasoning_content deltas from the stream', async () => {
    openaiCreateMock.mockResolvedValue((async function* () {
      yield { model: 'grok-3-mini', choices: [{ delta: { reasoning_content: 'pondering...' } }] };
      yield { model: 'grok-3-mini', choices: [{ delta: { content: 'answer' } }] };
      yield { model: 'grok-3-mini', choices: [{ delta: {}, finish_reason: 'stop' }] };
    })());

    const chunks = await collect(new XAIAdapter().streamChat(messages, xaiConfig({ enableThinking: true })));
    expect(chunks.map(c => c.thinking?.content || '').join('')).toBe('pondering...');
    expect(chunks.map(c => c.content).join('')).toBe('answer');
  });
});

describe('OllamaAdapter thinking', () => {
  function ndjsonResponse(lines: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line + '\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200 });
  }

  function ollamaConfig(overrides: Partial<AIServiceConfig> = {}): AIServiceConfig {
    return {
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3',
      ...overrides
    } as AIServiceConfig;
  }

  it('sends think:true and yields native thinking chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      '{"model":"qwen3","message":{"thinking":"reasoning step"},"done":false}',
      '{"model":"qwen3","message":{"content":"final answer"},"done":false}',
      '{"model":"qwen3","message":{"content":""},"done":true}'
    ]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const chunks = await collect(new OllamaAdapter().streamChat(messages, ollamaConfig({ enableThinking: true })));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.think).toBe(true);
      expect(chunks.map(c => c.thinking?.content || '').join('')).toBe('reasoning step');
      expect(chunks.map(c => c.content).join('')).toBe('final answer');
      expect(chunks.at(-1)?.done).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('splits inline <think> tags even when they are broken across chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      '{"model":"deepseek-r1","message":{"content":"<thi"},"done":false}',
      '{"model":"deepseek-r1","message":{"content":"nk>deep thought</th"},"done":false}',
      '{"model":"deepseek-r1","message":{"content":"ink>the answer"},"done":false}',
      '{"model":"deepseek-r1","message":{"content":""},"done":true}'
    ]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const chunks = await collect(new OllamaAdapter().streamChat(messages, ollamaConfig({ enableThinking: true })));

      expect(chunks.map(c => c.thinking?.content || '').join('')).toBe('deep thought');
      expect(chunks.map(c => c.content).join('')).toBe('the answer');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retries without think when the model rejects it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"model does not support thinking"}', { status: 400 }))
      .mockResolvedValueOnce(ndjsonResponse([
        '{"model":"llama3.3","message":{"content":"plain answer"},"done":false}',
        '{"model":"llama3.3","message":{"content":""},"done":true}'
      ]));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const chunks = await collect(new OllamaAdapter().streamChat(messages, ollamaConfig({ model: 'llama3.3', enableThinking: true })));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(retryBody.think).toBeUndefined();
      expect(chunks.map(c => c.content).join('')).toBe('plain answer');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
