export interface AIProvider {
  id: string;
  name: string;
  description: string;
  fields: {
    name: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'boolean' | 'number';
    required: boolean;
    placeholder?: string;
    description?: string;
    min?: number;
    max?: number;
    step?: number;
  }[];
  models: (string | { id?: string; name?: string; [key: string]: unknown })[];
}

export interface ProviderConfig {
  provider: string;
  config: Record<string, string>;
  model: string;
  is_default: boolean;
  models?: (string | { id?: string; name?: string; [key: string]: unknown })[];
}
