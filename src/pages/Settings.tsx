import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { setStorageItem, getStorageItem } from '../lib/storage';
import { fetchWithAuth } from '../lib/fetch';
import ProviderSettings from '../components/settings/ProviderSettings';
import UserManagement from '../components/settings/UserManagement';
import LanguageSettings from '../components/settings/LanguageSettings';
import CacheManagement from '../components/settings/CacheManagement';
import type { AIProvider, ProviderConfig } from '../components/settings/types';
import OnmiTopBar from '@/components/onmi/OnmiTopBar';
import { OnmiPageShell, OnmiStaticSidebar } from '@/components/onmi/OnmiShell';
import { OnmiRule, ProviderGlyph, StatusDot } from '@/components/onmi/OnmiPrimitives';
import { PROVIDER_ORDER, getProviderName } from '@/components/onmi/providerMeta';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import { useResponsiveSidebar } from '@/hooks/useResponsiveSidebar';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { t } = useTranslation();
  const copy = useOnmiCopy();
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeTab, setActiveTabState] = useState<string>('');
  const { showSidebar, setShowSidebar } = useResponsiveSidebar();

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    const result = setStorageItem('settings-active-tab', tab);
    if (!result.success) {
      console.error('Failed to save active tab:', result.error);
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [autoSaveTimeouts, setAutoSaveTimeouts] = useState<Record<string, NodeJS.Timeout>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testModels, setTestModels] = useState<Record<string, string>>({});
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean> | null>(null);
  const [modelFetchResults, setModelFetchResults] = useState<Record<string, {
    success: boolean;
    models: (string | { id?: string; name?: string; [key: string]: unknown })[];
    researchModels?: (string | { id?: string; name?: string; [key: string]: unknown })[];
    message: string
  }>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, { status: 'idle' | 'success' | 'error'; message: string; timestamp?: number }>>({});
  const [manualSaving, setManualSaving] = useState<Record<string, boolean>>({});

  const processedConfigsRef = useRef<Set<string>>(new Set());

  // configs 的 ref 镜像：防抖 setTimeout 会捕获旧的 saveConfig 闭包，
  // 那个闭包里的 configs 是过期的。所有 saveConfig 内部对 configs 的读取
  // 都必须走这个 ref 而不是闭包变量，否则粘贴 API Key 后 1 秒触发的自动保存
  // 会看到空的 configs 并抛 "配置不存在"。
  const configsRef = useRef<ProviderConfig[]>([]);
  useEffect(() => { configsRef.current = configs; }, [configs]);

  // Reset confirmation state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetLoading, setShowResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  // ─── Effects ──────────────────────────────────────────────────────

  useEffect(() => {
    const loadData = async () => {
      await loadProviders();
      await loadConfigs();
    };
    loadData();
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;
    const savedTabResult = getStorageItem<string>('settings-active-tab');
    const savedTab = savedTabResult.success ? savedTabResult.data : null;
    const isValidTab = savedTab && (
      savedTab === 'user-management' ||
      savedTab === 'language-settings' ||
      savedTab === 'cache-management' ||
      providers.some(provider => provider.id === savedTab)
    );
    if (isValidTab) {
      setActiveTabState(savedTab!);
    } else {
      const firstProvider = providers[0]?.id;
      if (firstProvider) {
        setActiveTabState(firstProvider);
        const result = setStorageItem('settings-active-tab', firstProvider);
        if (!result.success) console.error('Failed to save active tab:', result.error);
      }
    }
  }, [providers]);

  useEffect(() => {
    if (configs.length > 0) {
      processedConfigsRef.current.clear();
      const uniqueConfigs = new Map<string, typeof configs[0]>();
      configs.forEach(config => {
        if (config.models && config.models.length > 0) {
          const existingConfig = uniqueConfigs.get(config.provider);
          if (!existingConfig || config.models.length > (existingConfig.models?.length || 0)) {
            uniqueConfigs.set(config.provider, config);
          }
        }
      });
      uniqueConfigs.forEach((config) => {
        if (fetchingModels && fetchingModels[config.provider]) return;
        setProviders(prev => prev.map(p => {
          if (p.id === config.provider) {
            if (config.provider === 'ollama' && modelFetchResults[config.provider]?.success) return p;
            const hasDynamicModels = config.models?.some((model: any) =>
              model && typeof model === 'object' && ('id' in model || 'name' in model)
            );
            if (hasDynamicModels) {
              const dynamicModels = (config.models || []).filter((model: any) =>
                model && typeof model === 'object' && ('id' in model || 'name' in model)
              );
              const regularModels: any[] = [];
              const researchModels: any[] = [];
              dynamicModels.forEach((model: any) => {
                const modelId = (model?.id || model?.name || '').toLowerCase();
                if (modelId.includes('research') || modelId.includes('o3-deep-research') || modelId.includes('o4-mini-deep-research')) {
                  researchModels.push(model);
                } else {
                  regularModels.push(model);
                }
              });
              if (config.provider === 'openai' && (regularModels.length > 0 || researchModels.length > 0)) {
                const configKey = `${config.provider}-${regularModels.length}-${researchModels.length}`;
                if (!processedConfigsRef.current.has(configKey)) {
                  processedConfigsRef.current.add(configKey);
                  setModelFetchResults(prev => ({
                    ...prev,
                    [config.provider]: { success: true, models: regularModels, researchModels, message: 'settings.fetchModelsSuccess' }
                  }));
                  if (researchModels.length > 0) {
                    console.log(`[INFO] 从后端配置恢复 ${config.provider} Research 模型:`, researchModels.map((m: any) => m.id || m.name));
                  }
                }
              }
              return { ...p, models: dynamicModels };
            } else {
              return { ...p, models: (config.models || []) as (string | { id?: string; name?: string; [key: string]: unknown })[] };
            }
          }
          return p;
        }));
        if (config.provider === 'ollama') {
          setTestModels(prev => ({ ...prev, [config.provider]: prev[config.provider] || 'auto' }));
        }
      });
    }
  }, [configs, fetchingModels]);

  // ─── Data loading ─────────────────────────────────────────────────

  const loadProviders = async () => {
    try {
      type KnownProviderId = 'openai' | 'claude' | 'gemini' | 'xai' | 'ollama';
      interface ApiProviderData { id: KnownProviderId; name: string; description?: string; }
      const response = await fetchWithAuth('/api/providers/supported');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const apiProviders: AIProvider[] = result.data.map((provider: ApiProviderData) => {
            const fieldConfig: Record<KnownProviderId, AIProvider['fields']> = {
              openai: [
                { name: 'api_key', label: 'API Key', type: 'password' as const, required: true, placeholder: 'sk-...', description: t('providers.openai.apiKeyDescription') },
                { name: 'base_url', label: 'Base URL', type: 'url' as const, required: false, placeholder: 'https://api.openai.com/v1', description: t('providers.openai.baseUrlDescription') },
                { name: 'use_responses_api', label: t('providers.openai.useResponsesApi'), type: 'boolean' as const, required: false, description: t('providers.openai.responsesApiDescription') },
              ],
              claude: [
                { name: 'api_key', label: 'API Key', type: 'password' as const, required: true, placeholder: 'sk-ant-...', description: t('providers.claude.apiKeyDescription') },
                { name: 'base_url', label: 'Base URL', type: 'url' as const, required: false, placeholder: 'https://api.anthropic.com', description: t('providers.claude.baseUrlDescription') },
              ],
              gemini: [
                { name: 'api_key', label: 'API Key', type: 'password' as const, required: true, placeholder: 'AIza...', description: t('providers.gemini.apiKeyDescription') },
                { name: 'base_url', label: 'Base URL', type: 'url' as const, required: false, placeholder: 'https://generativelanguage.googleapis.com', description: t('providers.gemini.baseUrlDescription') },
              ],
              xai: [
                { name: 'api_key', label: 'API Key', type: 'password' as const, required: true, placeholder: 'xai-...', description: t('providers.xai.apiKeyDescription') },
                { name: 'base_url', label: 'Base URL', type: 'url' as const, required: false, placeholder: 'https://api.x.ai/v1', description: t('providers.xai.baseUrlDescription') },
              ],
              ollama: [
                { name: 'base_url', label: 'Base URL', type: 'url' as const, required: true, placeholder: 'http://localhost:11434', description: t('providers.ollama.baseUrlDescription') },
              ],
            };
            const modelLists: Record<KnownProviderId, (string | { id?: string; name?: string; [key: string]: unknown })[]> = {
              openai: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
              claude: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
              gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
              xai: ['grok-4', 'grok-3', 'grok-2-1212', 'grok-2-vision-1212'],
              ollama: [],
            };
            return {
              id: provider.id,
              name: provider.name,
              description: t(`providers.${provider.id}.description`, `${provider.name} series models`),
              fields: fieldConfig[provider.id] || [],
              models: modelLists[provider.id] || [],
            };
          });
          setProviders(apiProviders);
        }
      } else {
        console.warn('API call failed, using fallback data');
        setProviders(getFallbackProviders(t));
      }
    } catch (error) {
      console.error('Failed to load AI service providers:', error);
      setProviders(getFallbackProviders(t));
    }
  };

  const loadConfigs = async () => {
    try {
      const response = await fetchWithAuth('/api/providers/config');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const loadedConfigs: ProviderConfig[] = result.data.map((config: any) => {
            const { id, user_id, provider_name, available_models, default_model, is_active, created_at, updated_at, ...configFields } = config;
            return { provider: config.provider_name, config: configFields, model: config.default_model || '', is_default: false, models: config.available_models || [] };
          });
          setConfigs(loadedConfigs);
        } else {
          setConfigs([]);
        }
      } else {
        setConfigs([]);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      setConfigs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Config helpers ───────────────────────────────────────────────

  const getProviderConfig = (providerId: string): ProviderConfig | undefined => {
    return configs.find(config => config.provider === providerId);
  };

  const getProviderDisplayName = (providerId: string): string => {
    const providerNames: { [key: string]: string } = { openai: 'OpenAI', claude: 'Anthropic Claude', gemini: 'Google Gemini', xai: 'xAI Grok', ollama: 'Ollama' };
    return providerNames[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  const updateConfig = (providerId: string, field: string, value: string | (string | { id?: string; name?: string; [key: string]: unknown })[], autoSaveEnabled: boolean = true) => {
    setConfigs(prev => {
      const existingIndex = prev.findIndex(config => config.provider === providerId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const newConfig = { ...updated[existingIndex] };
        if (field === 'models') {
          newConfig.models = value as (string | { id?: string; name?: string; [key: string]: unknown })[];
        } else {
          newConfig.config = { ...newConfig.config, [field]: value as string };
        }
        updated[existingIndex] = newConfig;
        if (field === 'model') {
          const model = value as string;
          const selectedModelData = { provider: providerId, providerName: getProviderDisplayName(providerId), model, displayName: model };
          setStorageItem('selectedModel', selectedModelData);
        }
        return updated;
      } else {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) return prev;
        let defaultModel = '';
        if (provider.models.length > 0) {
          if (providerId === 'ollama') {
            defaultModel = selectSmartDefaultModel(provider.models, providerId, 'default') || '';
          } else {
            defaultModel = typeof provider.models[0] === 'string' ? provider.models[0] : provider.models[0]?.id || provider.models[0]?.name || '';
          }
        }
        const newProviderConfig: ProviderConfig = { provider: providerId, config: {}, model: defaultModel, is_default: false };
        if (field === 'models') {
          newProviderConfig.models = value as (string | { id?: string; name?: string; [key: string]: unknown })[];
        } else {
          newProviderConfig.config[field] = value as string;
        }
        return [...prev, newProviderConfig];
      }
    });
    if (autoSaveEnabled) {
      if (autoSaveTimeouts[providerId]) clearTimeout(autoSaveTimeouts[providerId]);
      const timeoutId = setTimeout(() => { saveConfig(providerId, true); }, 1000);
      setAutoSaveTimeouts(prev => ({ ...prev, [providerId]: timeoutId }));
    }
  };

  const updateModel = (providerId: string, model: string, autoSaveEnabled: boolean = true) => {
    setConfigs(prev => {
      const existingIndex = prev.findIndex(config => config.provider === providerId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], model };
        const selectedModelData = { provider: providerId, providerName: getProviderDisplayName(providerId), model, displayName: model };
        setStorageItem('selectedModel', selectedModelData);
        return updated;
      }
      return prev;
    });
    if (autoSaveEnabled) {
      if (autoSaveTimeouts[providerId]) clearTimeout(autoSaveTimeouts[providerId]);
      const timeoutId = setTimeout(() => { saveConfig(providerId, true); }, 1000);
      setAutoSaveTimeouts(prev => ({ ...prev, [providerId]: timeoutId }));
    }
  };

  const setAsDefault = (providerId: string) => {
    setConfigs(prev => prev.map(config => ({ ...config, is_default: config.provider === providerId })));
  };

  const manualSaveConfig = async (providerId: string) => {
    setManualSaving(prev => ({ ...prev, [providerId]: true }));
    if (autoSaveTimeouts[providerId]) {
      clearTimeout(autoSaveTimeouts[providerId]);
      setAutoSaveTimeouts(prev => { const updated = { ...prev }; delete updated[providerId]; return updated; });
    }
    await saveConfig(providerId, false, true);
  };

  const saveConfig = async (providerId: string, silent: boolean = false, isManual: boolean = false) => {
    try {
      // 走 ref 而不是闭包：防抖 setTimeout 捕获的是旧的 saveConfig 实例，
      // 那个实例的 configs 闭包可能还是空数组（尤其是粘贴 API Key 后的首次自动保存）
      const config = configsRef.current.find(c => c.provider === providerId);
      if (!config) throw new Error('配置不存在');

      // 必填字段未填时：
      // - 静默自动保存 → 直接 return（用户还在编辑，不打扰，也不删除已有配置）
      // - 手动保存 → 显示错误提示，但不再删除已有配置
      const missingRequired =
        (providerId === 'ollama' && (!config.config.base_url || config.config.base_url.trim() === '')) ||
        (providerId !== 'ollama' && (!config.config.api_key || config.config.api_key.trim() === ''));
      if (missingRequired) {
        if (!silent) {
          const msgKey = providerId === 'ollama' ? 'settings.baseUrlMissing' : 'settings.apiKeyMissing';
          setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'error', message: t(msgKey), timestamp: Date.now() } }));
          setTimeout(() => { setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'idle', message: '' } })); }, 5000);
        }
        return;
      }

      const response = await fetchWithAuth('/api/providers/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerName: providerId, apiKey: config.config.api_key, baseUrl: config.config.base_url, availableModels: config.models || modelFetchResults[providerId]?.models || [], defaultModel: config.model, extraConfig: config.config }),
      });
      // 非 2xx 响应（401/403/500 等）也要解析错误信息，否则用户只看到"保存失败"不知道原因
      const result = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `保存配置失败 (HTTP ${response.status})`);
      }
      const selectedModelData = { provider: providerId, providerName: getProviderDisplayName(providerId), model: config.model, displayName: config.model };
      setStorageItem('selectedModel', selectedModelData);
      window.dispatchEvent(new Event('localStorageChanged'));

      // 手动保存和自动保存都展示反馈，自动保存使用更短的停留时间
      const statusMessage = isManual ? t('settings.configSaved') : t('settings.autoSaved');
      const timeoutMs = isManual ? 1200 : 1500;
      setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'success', message: statusMessage, timestamp: Date.now() } }));
      setTimeout(() => { setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'idle', message: '' } })); }, timeoutMs);
    } catch (error) {
      console.error('保存配置失败:', error);
      // 把后端真实的错误消息带出来，用户才知道是网络、认证还是其他问题
      const errorMessage = error instanceof Error ? error.message : t('settings.configSaveFailed');
      setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'error', message: `${t('settings.configSaveFailed')}: ${errorMessage}`, timestamp: Date.now() } }));
      setTimeout(() => { setSaveStatus(prev => ({ ...prev, [providerId]: { status: 'idle', message: '' } })); }, 5000);
    } finally {
      if (isManual) setManualSaving(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const testConnection = async (providerId: string) => {
    try {
      setTestingProvider(providerId);
      const config = getProviderConfig(providerId);
      if (!config) { setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: '请先配置提供商信息' } })); return; }
      if (providerId === 'ollama') {
        const ollamaResults = modelFetchResults[providerId];
        if (!ollamaResults || !ollamaResults.success || ollamaResults.models.length === 0) {
          setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: 'Ollama需要先获取模型列表。请点击"获取模型列表"按钮获取已安装的模型，然后选择一个模型进行测试。' } }));
          return;
        }
        if (!testModels[providerId] || testModels[providerId] === 'auto') {
          if (ollamaResults?.success && ollamaResults.models.length > 0) {
            const autoSelectedModel = selectSmartDefaultModel(ollamaResults.models, providerId, 'test');
            if (!autoSelectedModel) { setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: '无法自动选择测试模型，请手动选择一个模型。' } })); return; }
          } else { setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: '请先选择一个模型进行测试。' } })); return; }
        }
      }
      if (providerId !== 'ollama' && !config.config.api_key) { setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: 'API Key 是必填项' } })); return; }
      const response = await fetchWithAuth('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: providerId, apiKey: config.config.api_key, baseUrl: config.config.base_url,
          model: (() => {
            if (testModels[providerId] === 'auto' && providerId === 'ollama') {
              const mr = modelFetchResults[providerId];
              if (mr?.success && mr.models.length > 0) return selectSmartDefaultModel(mr.models, providerId, 'test') || config.model || 'default';
            }
            return testModels[providerId] || config.model || 'default';
          })(),
        }),
      });
      const result = await response.json();
      const testModel = (() => {
        if (testModels[providerId] === 'auto' && providerId === 'ollama') {
          const mr = modelFetchResults[providerId];
          if (mr?.success && mr.models.length > 0) { const a = selectSmartDefaultModel(mr.models, providerId, 'test'); return a ? `${a} (自动选择)` : (config.model || 'default'); }
        }
        return testModels[providerId] || config.model || 'default';
      })();
      setTestResults(prev => ({ ...prev, [providerId]: { success: result.success, message: result.success ? `连接测试成功！使用模型: ${testModel}` : (result.error || '连接测试失败，请检查配置。') } }));
    } catch (error) {
      setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: error instanceof Error ? error.message : '测试过程中发生错误' } }));
    } finally {
      setTestingProvider(null);
    }
  };

  // 免费的连接测试：不传 model，仅触发后端的 models.list 等免费元数据路径。
  // Ollama 例外：后端 /test 对 Ollama 要求必须带 model，所以改用 /models（同样免费）。
  const testProviderConnection = async (providerId: string) => {
    try {
      setTestingProvider(providerId);
      const config = getProviderConfig(providerId);
      if (!config) {
        setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: t('settings.apiKeyRequired_toast') } }));
        return;
      }
      if (providerId !== 'ollama' && !config.config.api_key) {
        setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: t('settings.apiKeyRequired_toast') } }));
        return;
      }
      if (providerId === 'ollama' && !config.config.base_url) {
        setTestResults(prev => ({ ...prev, [providerId]: { success: false, message: t('settings.baseUrlMissing') } }));
        return;
      }

      // Ollama：后端 /test 强制要求带 model，所以走 /models 端点（同样免费）
      if (providerId === 'ollama') {
        const response = await fetchWithAuth('/api/providers/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerName: providerId, apiKey: config.config.api_key, baseUrl: config.config.base_url }),
        });
        const result = await response.json();
        const modelCount = result.data?.models?.length || 0;
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: !!result.success,
            message: result.success
              ? t('settings.connectionOk', { count: modelCount })
              : (result.error || t('settings.connectionFailed')),
          },
        }));
        return;
      }

      // 其他 provider：POST /test 但不传 model —— 后端会跳过 testSpecificModel 的付费路径
      const response = await fetchWithAuth('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: providerId,
          apiKey: config.config.api_key,
          baseUrl: config.config.base_url,
          // 故意不传 model
        }),
      });
      const result = await response.json();
      const modelCount = result.data?.models?.length || 0;
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: !!result.success,
          message: result.success
            ? t('settings.connectionOk', { count: modelCount })
            : (result.error || t('settings.connectionFailed')),
        },
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: false, message: error instanceof Error ? error.message : t('settings.networkError') },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const togglePasswordVisibility = (providerId: string, fieldName: string) => {
    const key = `${providerId}-${fieldName}`;
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectSmartDefaultModel = (models: any[], providerId: string, purpose: 'test' | 'default' = 'default') => {
    if (!models || models.length === 0) return null;
    if (models.length === 1) return models[0].id || models[0].name || models[0];
    if (providerId === 'ollama') {
      const getSizeScore = (name: string) => {
        const bMatch = name.match(/(\d+\.?\d*)b/);
        if (bMatch) return parseFloat(bMatch[1]);
        const mMatch = name.match(/(\d+\.?\d*)m/);
        if (mMatch) return parseFloat(mMatch[1]) / 1000;
        if (name.includes('nano') || name.includes('tiny')) return 0.1;
        if (name.includes('mini') || name.includes('small')) return 1;
        if (name.includes('medium')) return 7;
        if (name.includes('large')) return 13;
        if (name.includes('xl') || name.includes('extra')) return 70;
        return 999;
      };
      if (purpose === 'test') {
        const sortedModels = [...models].sort((a, b) => getSizeScore((a.id || a.name || a || '').toString().toLowerCase()) - getSizeScore((b.id || b.name || b || '').toString().toLowerCase()));
        const selected = sortedModels[0];
        return selected?.id || selected?.name || selected || null;
      } else {
        const modelsWithSize = models.map(model => ({ ...model, size: getSizeScore((model.id || model.name || model || '').toString().toLowerCase()) })).filter(model => model.size < 999);
        if (modelsWithSize.length === 0) {
          const sortedModels = [...models].sort((a, b) => getSizeScore((a.id || a.name || a || '').toString().toLowerCase()) - getSizeScore((b.id || b.name || b || '').toString().toLowerCase()));
          const selected = sortedModels[0];
          return selected?.id || selected?.name || selected;
        }
        const primary = modelsWithSize.filter(m => m.size >= 1 && m.size <= 15);
        if (primary.length > 0) { const best = primary.reduce((b, c) => Math.abs(c.size - 7) < Math.abs(b.size - 7) ? c : b); return best?.id || best?.name; }
        const small = modelsWithSize.filter(m => m.size >= 0.5 && m.size < 1);
        if (small.length > 0) { const best = small.reduce((b, c) => c.size > b.size ? c : b); return best?.id || best?.name; }
        const medLarge = modelsWithSize.filter(m => m.size > 15 && m.size <= 20);
        if (medLarge.length > 0) { const best = medLarge.reduce((b, c) => c.size < b.size ? c : b); return best?.id || best?.name; }
        const tiny = modelsWithSize.filter(m => m.size < 0.5);
        if (tiny.length > 0) { const best = tiny.reduce((b, c) => c.size > b.size ? c : b); return best?.id || best?.name; }
        const large = modelsWithSize.filter(m => m.size > 20);
        if (large.length > 0) { const best = large.reduce((b, c) => c.size < b.size ? c : b); return best?.id || best?.name; }
      }
    }
    return null;
  };

  const fetchModels = async (providerId: string) => {
    if (fetchingModels && (fetchingModels as any)[providerId]) return;
    setFetchingModels(prev => ({ ...(prev || {}), [providerId]: true }));
    try {
      const config = getProviderConfig(providerId);
      if (!config || (providerId !== 'ollama' && !config.config.api_key)) {
        setModelFetchResults(prev => ({ ...prev, [providerId]: { success: false, models: [], researchModels: [], message: providerId === 'ollama' ? '请先配置服务器地址' : '请先配置API密钥' } }));
        return;
      }
      const response = await fetchWithAuth('/api/providers/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerName: providerId, apiKey: config.config.api_key, baseUrl: config.config.base_url }) });
      const result = await response.json();
      if (result.success) {
        const allModels = result.data.models || [];
        const regularModels: any[] = [];
        const researchModels: any[] = [];
        allModels.forEach((model: any) => {
          const modelId = (typeof model === 'string' ? model : model?.id || model?.name || '').toLowerCase();
          if (modelId.includes('-research') || modelId.includes('deep-research') || modelId.endsWith('-research') || modelId.endsWith('research')) {
            researchModels.push(model);
          } else {
            regularModels.push(model);
          }
        });
        const allModelsForSaving = [...regularModels, ...researchModels];
        const testModel = selectSmartDefaultModel(regularModels, providerId, 'test');
        const defaultModel = selectSmartDefaultModel(regularModels, providerId, 'default');
        if (providerId === 'ollama' && defaultModel) updateModel(providerId, defaultModel);
        setModelFetchResults(prev => ({ ...prev, [providerId]: { success: true, models: regularModels, researchModels, message: providerId === 'ollama' && regularModels.length > 0 ? `${t('settings.fetchModelsSuccess')} 已自动选择默认模型: ${defaultModel}, 测试模型: ${testModel}` : t('settings.fetchModelsSuccess') } }));
        setTimeout(async () => {
          try {
            // 同样走 ref 避免 setTimeout 闭包过期
            const updatedConfig = configsRef.current.find(c => c.provider === providerId);
            if (updatedConfig) {
              const resp = await fetchWithAuth('/api/providers/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerName: providerId, apiKey: updatedConfig.config.api_key, baseUrl: updatedConfig.config.base_url, availableModels: allModelsForSaving, defaultModel }) });
              if (resp.ok) {
                window.dispatchEvent(new Event('modelsUpdated'));
                await loadConfigs();
              }
            }
          } catch (error) { console.error('保存获取的模型列表失败:', error); }
        }, 100);
      } else {
        setModelFetchResults(prev => ({ ...prev, [providerId]: { success: false, models: [], researchModels: [], message: result.error || '获取模型列表失败' } }));
      }
    } catch (error) {
      console.error(`${providerId}获取模型网络错误:`, error);
      setModelFetchResults(prev => ({ ...prev, [providerId]: { success: false, models: [], researchModels: [], message: '网络错误，请检查连接' } }));
    } finally {
      setFetchingModels(null);
    }
  };

  // ─── Reset models ─────────────────────────────────────────────────

  const resetAllModelsToDefault = () => setShowResetConfirm(true);

  const executeReset = async () => {
    setShowResetConfirm(false);
    setShowResetLoading(true);
    setResetStatus({ status: 'loading', message: t('settings.resettingModels') });
    try {
      const response = await fetchWithAuth('/api/data/clear-models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setResetStatus({ status: 'success', message: t('settings.resetSuccess', { count: result.data?.clearedCount || 0 }) });
          setTimeout(() => { setShowResetLoading(false); window.location.reload(); }, 1500);
        } else { setShowResetLoading(false); setResetStatus({ status: 'error', message: t('settings.resetFailed', { error: result.error || t('common.unknownError') }) }); }
      } else { throw new Error(`HTTP ${response.status}: ${response.statusText}`); }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError');
      setShowResetLoading(false);
      setResetStatus({ status: 'error', message: t('settings.resetFailed', { error: errorMessage }) });
    }
    setTimeout(() => { setResetStatus({ status: 'idle', message: '' }); }, 3000);
  };

  // ─── Render ───────────────────────────────────────────────────────

  const sortedProviders = [...providers].sort((a, b) => {
    const ai = PROVIDER_ORDER.indexOf(a.id);
    const bi = PROVIDER_ORDER.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const configuredProviderCount = providers.filter((provider) => isProviderConfigured(provider.id, getProviderConfig(provider.id))).length;
  const activeProvider = providers.find((provider) => provider.id === activeTab);

  const renderActivePanel = () => {
    if (activeProvider) {
      return (
          <ProviderSettings
          key={activeProvider.id}
          provider={activeProvider}
          config={getProviderConfig(activeProvider.id)}
          testResult={testResults[activeProvider.id]}
            testResults={testResults}
            testingProvider={testingProvider}
            showPasswords={showPasswords}
            testModels={testModels}
            fetchingModels={fetchingModels}
            modelFetchResults={modelFetchResults}
            saveStatus={saveStatus}
            manualSaving={manualSaving}
            updateConfig={updateConfig}
            updateModel={updateModel}
            setAsDefault={setAsDefault}
            manualSaveConfig={manualSaveConfig}
            testConnection={testConnection}
            testProviderConnection={testProviderConnection}
            fetchModels={fetchModels}
            togglePasswordVisibility={togglePasswordVisibility}
            setTestModels={setTestModels}
            setTestingProvider={setTestingProvider}
            setTestResults={setTestResults}
            getProviderConfig={getProviderConfig}
          />
      );
    }
    if (activeTab === 'user-management') return <UserManagement />;
    if (activeTab === 'language-settings') return <LanguageSettings loadConfigs={loadConfigs} />;
    if (activeTab === 'cache-management') {
      return (
        <CacheManagement
          resetAllModelsToDefault={resetAllModelsToDefault}
          resetStatus={resetStatus}
          showResetConfirm={showResetConfirm}
          setShowResetConfirm={setShowResetConfirm}
          showResetLoading={showResetLoading}
          executeReset={executeReset}
        />
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="onmi onmi-app">
        <div className="onmi-loading-screen">
          <div className="onmi-spinner" />
          <span className="onmi-mono">{copy('加载信号源配置...', 'Loading signal sources...')}</span>
        </div>
      </div>
    );
  }

  return (
    <OnmiPageShell
      sidebarOpen={showSidebar}
      onCloseSidebar={() => setShowSidebar(false)}
      topbar={
        <OnmiTopBar
          sidebarOpen={showSidebar}
          onToggleSidebar={() => setShowSidebar((open) => !open)}
          provider={activeProvider?.id || 'openai'}
          modelLabel={activeProvider ? getProviderName(activeProvider.id) : copy('设置', 'Settings')}
          status="API · CONFIG"
          onCommand={() => window.alert(copy('命令面板是占位功能。', 'Command palette is a placeholder.'))}
        />
      }
      sidebar={<OnmiStaticSidebar activeId="settings" />}
    >
      <div className="onmi-settings onmi-scroll">
        <div className="onmi-page-header">
          <div className="onmi-section-label">CONFIG · 02 · API CREDENTIALS</div>
          <h1>{copy('信号源 · API 凭证', 'Signal sources · API credentials')}</h1>
          <p>
            {copy(
              'ONMI 保留当前项目的真实 Provider 配置、模型拉取与连接测试逻辑；自定义端点与命令面板等能力先以占位状态呈现。',
              'ONMI keeps the real provider configuration, model fetch, and connection test flows. Custom endpoints and command palette remain placeholders.'
            )}
          </p>
        </div>

        <ProviderSignalBoard
          providers={sortedProviders}
          activeTab={activeTab}
          configuredCount={configuredProviderCount}
          getProviderConfig={getProviderConfig}
          setActiveTab={setActiveTab}
        />

        <section className="onmi-settings-tabs">
          <OnmiRule>{copy('配置面板', 'Configuration panel')}</OnmiRule>
          <div className="onmi-utility-tabs">
            <button type="button" className={cn(activeTab === 'user-management' && 'active')} onClick={() => setActiveTab('user-management')}>
              {copy('用户管理', 'User management')}
            </button>
            <button type="button" className={cn(activeTab === 'language-settings' && 'active')} onClick={() => setActiveTab('language-settings')}>
              {copy('语言', 'Language')}
            </button>
            <button type="button" className={cn(activeTab === 'cache-management' && 'active')} onClick={() => setActiveTab('cache-management')}>
              {copy('缓存', 'Cache')}
            </button>
          </div>
          <div className="onmi-settings-panel">{renderActivePanel()}</div>
        </section>
      </div>
    </OnmiPageShell>
  );
}

// ─── Fallback providers (when API fails) ────────────────────────────

function isProviderConfigured(providerId: string, config?: ProviderConfig): boolean {
  if (!config) return false;
  if (providerId === 'ollama') return Boolean(config.config.base_url?.trim());
  return Boolean(config.config.api_key?.trim());
}

interface ProviderSignalBoardProps {
  providers: AIProvider[];
  activeTab: string;
  configuredCount: number;
  getProviderConfig: (providerId: string) => ProviderConfig | undefined;
  setActiveTab: (tab: string) => void;
}

function ProviderSignalBoard({
  providers,
  activeTab,
  configuredCount,
  getProviderConfig,
  setActiveTab,
}: ProviderSignalBoardProps) {
  const copy = useOnmiCopy();
  const total = providers.length || 5;

  return (
    <section className="onmi-signal-board">
      <div className="onmi-radar-card">
        <svg viewBox="-140 -140 280 280" aria-hidden="true">
          {[40, 70, 100, 130].map((radius) => (
            <circle key={radius} cx="0" cy="0" r={radius} fill="none" stroke="var(--line-1)" />
          ))}
          <line x1="-130" y1="0" x2="130" y2="0" stroke="var(--line-1)" />
          <line x1="0" y1="-130" x2="0" y2="130" stroke="var(--line-1)" />
          <path d="M0,0 L130,0 A130,130 0 0,1 92,92 z" fill="var(--sig-glow)" opacity="0.55" />
          {providers.map((provider, index) => {
            const angle = (index / Math.max(providers.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const configured = isProviderConfigured(provider.id, getProviderConfig(provider.id));
            const radius = configured ? 58 + index * 13 : 124;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const color = configured ? 'var(--sig)' : 'var(--fg-3)';
            return (
              <g key={provider.id}>
                <line x1="0" y1="0" x2={x} y2={y} stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.45" />
                <circle cx={x} cy={y} r="4" fill={color} />
                <text x={x + 8} y={y + 3} style={{ fontSize: 9, fill: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>
                  {provider.id.toUpperCase()}
                </text>
              </g>
            );
          })}
          <circle cx="0" cy="0" r="6" fill="var(--bg-1)" stroke="var(--sig)" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2" fill="var(--sig)" />
        </svg>
        <div className="onmi-radar-caption onmi-mono">0ms --- 100ms --- 500ms+</div>
      </div>

      <div className="onmi-provider-board">
        <div className="onmi-provider-kpis">
          <MetricCard label={copy('已连接信号源', 'Active sources')} value={`${configuredCount}`} sub={`of ${total}`} accent />
          <MetricCard label={copy('Provider 总数', 'Providers')} value={`${total}`} sub={copy('可配置', 'configurable')} />
          <MetricCard label={copy('默认模型', 'Default model')} value="BYOK" sub={copy('用户自备密钥', 'bring your keys')} />
          <MetricCard label={copy('自定义端点', 'Custom endpoint')} value="Soon" sub={copy('占位', 'placeholder')} />
        </div>

        <OnmiRule>{copy('信号源列表', 'Signal sources')} · {total}</OnmiRule>
        <div className="onmi-provider-list">
          {providers.map((provider) => {
            const config = getProviderConfig(provider.id);
            const configured = isProviderConfigured(provider.id, config);
            const active = activeTab === provider.id;
            return (
              <button
                type="button"
                key={provider.id}
                className={cn('onmi-provider-row', active && 'active')}
                onClick={() => setActiveTab(provider.id)}
              >
                <ProviderGlyph provider={provider.id} size={30} active={active} />
                <span>
                  <strong>{getProviderName(provider.id)}</strong>
                  <small className="onmi-mono">{provider.models.length || config?.models?.length || 0} models</small>
                </span>
                <code>{maskCredential(provider.id, config)}</code>
                <StatusDot state={configured ? 'live' : 'off'} label={configured ? 'LIVE' : 'OFF'} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="onmi-metric-card">
      <div className="onmi-section-label">{label}</div>
      <strong className={accent ? 'accent' : ''}>{value}</strong>
      <span className="onmi-mono">{sub}</span>
    </div>
  );
}

function maskCredential(providerId: string, config?: ProviderConfig): string {
  if (!config) return 'not configured';
  if (providerId === 'ollama') return config.config.base_url || 'not configured';
  const key = config.config.api_key;
  if (!key) return 'not configured';
  if (key.length <= 10) return `${key.slice(0, 3)}...`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function getFallbackProviders(t: (key: string) => string): AIProvider[] {
  return [
    {
      id: 'openai', name: 'OpenAI', description: t('providers.openai.description'),
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...', description: t('providers.openai.apiKeyDescription') },
        { name: 'base_url', label: 'Base URL', type: 'url', required: false, placeholder: 'https://api.openai.com/v1', description: t('providers.openai.baseUrlDescription') },
        { name: 'use_responses_api', label: t('providers.openai.useResponsesApi'), type: 'boolean', required: false, description: t('providers.openai.responsesApiDescription') },
      ],
      models: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    },
    {
      id: 'claude', name: 'Anthropic Claude', description: t('providers.claude.description'),
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-...', description: t('providers.claude.apiKeyDescription') },
        { name: 'base_url', label: 'Base URL', type: 'url', required: false, placeholder: 'https://api.anthropic.com', description: t('providers.claude.baseUrlDescription') },
      ],
      models: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
    },
    {
      id: 'gemini', name: 'Google Gemini', description: t('providers.gemini.description'),
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'AIza...', description: t('providers.gemini.apiKeyDescription') },
        { name: 'base_url', label: 'Base URL', type: 'url', required: false, placeholder: 'https://generativelanguage.googleapis.com', description: t('providers.gemini.baseUrlDescription') },
      ],
      models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    },
    {
      id: 'xai', name: 'xAI Grok', description: t('providers.xai.description'),
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'xai-...', description: t('providers.xai.apiKeyDescription') },
        { name: 'base_url', label: 'Base URL', type: 'url', required: false, placeholder: 'https://api.x.ai/v1', description: t('providers.xai.baseUrlDescription') },
      ],
      models: ['grok-4', 'grok-3', 'grok-2-1212', 'grok-2-vision-1212'],
    },
    {
      id: 'ollama', name: 'Ollama', description: t('providers.ollama.description'),
      fields: [
        { name: 'base_url', label: 'Base URL', type: 'url', required: true, placeholder: 'http://localhost:11434', description: t('providers.ollama.baseUrlDescription') },
      ],
      models: [],
    },
  ];
}
