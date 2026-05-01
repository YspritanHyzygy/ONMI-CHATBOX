export interface ProviderVisualMeta {
  id: string;
  name: string;
  code: string;
  color: string;
  modelHint: string;
}

const PROVIDER_VISUALS: Record<string, ProviderVisualMeta> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    code: 'OAI',
    color: 'var(--p-openai)',
    modelHint: 'GPT / o-series',
  },
  claude: {
    id: 'claude',
    name: 'Anthropic',
    code: 'ANT',
    color: 'var(--p-claude)',
    modelHint: 'Claude',
  },
  gemini: {
    id: 'gemini',
    name: 'Google',
    code: 'GGL',
    color: 'var(--p-gemini)',
    modelHint: 'Gemini',
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    code: 'XAI',
    color: 'var(--p-xai)',
    modelHint: 'Grok',
  },
  grok: {
    id: 'xai',
    name: 'xAI',
    code: 'XAI',
    color: 'var(--p-xai)',
    modelHint: 'Grok',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    code: 'LOC',
    color: 'var(--p-ollama)',
    modelHint: 'Local',
  },
};

export const PROVIDER_ORDER = ['openai', 'claude', 'gemini', 'xai', 'ollama'];

export function getProviderVisual(provider?: string | null): ProviderVisualMeta {
  if (!provider) return PROVIDER_VISUALS.openai;
  return PROVIDER_VISUALS[provider.toLowerCase()] || {
    id: provider,
    name: provider.charAt(0).toUpperCase() + provider.slice(1),
    code: provider.slice(0, 3).toUpperCase(),
    color: 'var(--fg-2)',
    modelHint: 'Custom',
  };
}

export function getProviderName(provider?: string | null): string {
  return getProviderVisual(provider).name;
}
