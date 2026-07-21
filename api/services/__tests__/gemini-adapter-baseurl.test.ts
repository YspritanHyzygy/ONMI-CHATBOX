/**
 * Gemini adapter must honor a user-configured baseUrl for chat/stream,
 * matching the behavior of model listing (which already used buildServiceUrl).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGenerativeModelMock = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModelMock;
  }
}));

import { GeminiAdapter } from '../gemini-adapter';
import type { AIServiceConfig, ChatMessage } from '../types';

function makeConfig(baseUrl?: string): AIServiceConfig {
  return {
    apiKey: 'test-key',
    model: 'gemini-3.5-flash',
    baseUrl
  } as AIServiceConfig;
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('GeminiAdapter baseUrl passthrough', () => {
  beforeEach(() => {
    getGenerativeModelMock.mockReset();
    getGenerativeModelMock.mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => 'ok', usageMetadata: undefined }
      })
    });
  });

  it('passes a custom baseUrl as RequestOptions to getGenerativeModel', async () => {
    const adapter = new GeminiAdapter();
    await adapter.chat(messages, makeConfig('https://my-proxy.example.com'));
    expect(getGenerativeModelMock).toHaveBeenCalledTimes(1);
    expect(getGenerativeModelMock.mock.calls[0][1]).toEqual({ baseUrl: 'https://my-proxy.example.com' });
  });

  it('normalizes trailing slashes and version suffixes the same way url-utils does', async () => {
    const adapter = new GeminiAdapter();
    await adapter.chat(messages, makeConfig('https://my-proxy.example.com/v1beta/'));
    expect(getGenerativeModelMock.mock.calls[0][1]).toEqual({ baseUrl: 'https://my-proxy.example.com' });
  });

  it('omits RequestOptions for the official endpoint or when unset', async () => {
    const adapter = new GeminiAdapter();
    await adapter.chat(messages, makeConfig('https://generativelanguage.googleapis.com'));
    expect(getGenerativeModelMock.mock.calls[0][1]).toBeUndefined();

    await adapter.chat(messages, makeConfig(undefined));
    expect(getGenerativeModelMock.mock.calls[1][1]).toBeUndefined();
  });
});
