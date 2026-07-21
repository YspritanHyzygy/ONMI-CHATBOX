export interface SafeProviderExtraConfig {
  use_responses_api?: 'true' | 'false';
}

export function sanitizeProviderExtraConfig(input: unknown): SafeProviderExtraConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const value = (input as Record<string, unknown>).use_responses_api;
  if (value === true || value === 'true') return { use_responses_api: 'true' };
  if (value === false || value === 'false') return { use_responses_api: 'false' };
  return {};
}
