import { describe, expect, it } from 'vitest';
import { sanitizeProviderExtraConfig } from '../provider-config-safety.js';

describe('sanitizeProviderExtraConfig', () => {
  it('keeps the supported Responses API flag', () => {
    expect(sanitizeProviderExtraConfig({ use_responses_api: true })).toEqual({
      use_responses_api: 'true',
    });
    expect(sanitizeProviderExtraConfig({ use_responses_api: 'false' })).toEqual({
      use_responses_api: 'false',
    });
  });

  it('cannot replace ownership, credentials, or provider fields', () => {
    expect(sanitizeProviderExtraConfig({
      user_id: 'victim',
      provider_name: 'xai',
      api_key: 'stolen',
      base_url: 'https://attacker.invalid',
      is_active: false,
    })).toEqual({});
  });
});
