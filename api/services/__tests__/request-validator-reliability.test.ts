import { describe, expect, it } from 'vitest';
import { validateAIServiceConfig, validateChatRequest } from '../request-validator.js';

describe('chat request reliability validation', () => {
  it('does not inject a legacy model or demo user when they are omitted', () => {
    const result = validateChatRequest({ message: 'hello', provider: 'openai' });

    expect(result.valid).toBe(true);
    expect(result.data).toMatchObject({ message: 'hello', provider: 'openai' });
    expect(result.data?.model).toBeUndefined();
    expect(result.data?.userId).toBeUndefined();
  });

  it('preserves an explicit zero temperature', () => {
    const result = validateChatRequest({
      message: 'deterministic',
      provider: 'openai',
      parameters: { temperature: 0 }
    });

    expect(result.valid).toBe(true);
    expect(result.data?.parameters?.temperature).toBe(0);
  });

  it('rejects an unknown provider before chat persistence', () => {
    const result = validateChatRequest({ message: 'hello', provider: 'unknown-provider' });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid provider: unknown-provider');
  });

  it('treats undefined optional service parameters as omitted', () => {
    const result = validateAIServiceConfig({
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.3',
      temperature: undefined,
      maxTokens: undefined,
      topP: undefined,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });
});
