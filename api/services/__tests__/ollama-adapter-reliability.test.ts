import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaAdapter } from '../ollama-adapter.js';
import { normalizeOllamaBaseUrl } from '../config-manager.js';
import type { AIServiceConfig } from '../types.js';

const config: AIServiceConfig = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1/',
  model: 'llama3.3',
  temperature: 0
};

describe('OllamaAdapter reliability', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('normalizes legacy Ollama base URLs to the server root', () => {
    expect(normalizeOllamaBaseUrl('http://localhost:11434/v1///')).toBe('http://localhost:11434');
    expect(normalizeOllamaBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
  });

  it('normalizes legacy /v1 URLs and preserves temperature zero', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      model: 'llama3.3',
      message: { content: 'hello' },
      prompt_eval_count: 3,
      eval_count: 2
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await new OllamaAdapter().chat([{ role: 'user', content: 'hi' }], config);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: false,
      options: { temperature: 0 }
    });
    expect(response.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  });

  it('uses Ollama native NDJSON streaming', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"model":"llama3.3","message":{"content":"hel"},"done":false}\n'));
        controller.enqueue(encoder.encode('{"model":"llama3.3","message":{"content":"lo"},"done":false}\n'));
        // Final records are valid even without a trailing newline.
        controller.enqueue(encoder.encode('{"model":"llama3.3","message":{"content":""},"done":true}'));
        controller.close();
      }
    });
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));

    const chunks = [];
    for await (const chunk of new OllamaAdapter().streamChat(
      [{ role: 'user', content: 'hi' }],
      config
    )) {
      chunks.push(chunk);
    }

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ stream: true });
    expect(chunks.map(chunk => chunk.content).join('')).toBe('hello');
    expect(chunks.at(-1)?.done).toBe(true);
  });

  it('uses the native tags endpoint for model discovery', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: 'qwen3:8b' }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const models = await new OllamaAdapter().getAvailableModels(config);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
    expect(models).toEqual([{ id: 'qwen3:8b', name: 'qwen3:8b' }]);
  });
});
