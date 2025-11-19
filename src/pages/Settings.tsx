import { useState, useEffect, useRef } from 'react';
import { Save, Zap, Eye, EyeOff, AlertCircle, Settings as SettingsIcon, ArrowLeft, RefreshCw, Check, X, User, Lock, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUserId } from '../lib/user';
import useAuthStore from '../store/authStore';
import PasswordStrength from '../components/PasswordStrength';
import { convertModelIdToDisplayName } from '../lib/model-display-names';
import { removeStorageItem, getStorageInfo, setStorageItem, getStorageItem } from '../lib/storage';

interface AIProvider {
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

interface ProviderConfig {
  provider: string;
  config: Record<string, string>;
  model: string;
  is_default: boolean;
  models?: (string | { id?: string; name?: string; [key: string]: unknown })[];
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeTab, setActiveTabState] = useState<string>('');

  // 自定义 setActiveTab 函数，同时保存到 localStorage
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
  
  // 用于跟踪是否已经处理过配置恢复，避免无限循环
  const processedConfigsRef = useRef<Set<string>>(new Set());
  
  // Password management state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showUserPasswords, setShowUserPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // 缓存管理功能
  const handleClearCache = () => {
    if (confirm('确定要清除垃圾缓存吗？这将清理临时数据和设置状态，不会影响对话历史和重要配置。')) {
      // 普通清理：只清除不影响用户体验的垃圾缓存
      const itemsToRemove = [
        'settings-active-tab',  // 设置页面标签状态
        // 清理浏览器自动生成的缓存
      ];
      
      let successCount = 0;
      let errorCount = 0;
      
      itemsToRemove.forEach(item => {
        const result = removeStorageItem(item);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to remove ${item}:`, result.error);
        }
      });
      
      // 清理可能的临时数据和过期缓存
      const storageInfo = getStorageInfo();
      if (storageInfo.available) {
        storageInfo.keys.forEach(key => {
          // 清理可能的临时或过期数据
          if (key.includes('temp-') || 
              key.includes('cache-') || 
              key.includes('_timestamp') ||
              key.startsWith('debug-') ||
              key.startsWith('dev-')) {
            const result = removeStorageItem(key);
            if (result.success) {
              successCount++;
            } else {
              errorCount++;
            }
          }
        });
      }
      
      if (errorCount > 0) {
        alert(`垃圾缓存已清除！成功: ${successCount}, 失败: ${errorCount}`);
      } else {
        alert('垃圾缓存已清除！');
      }
      
      // 刷新页面以应用更改
      window.location.reload();
    }
  };

  const handleClearAllCache = () => {
    if (confirm('确定要深度清除缓存吗？这将删除对话历史、模型选择、AI参数等所有用户数据，保留登录状态和语言设置。几乎所有内容都需要重新配置。')) {
      // 深度清理：清除所有影响用户体验的数据
      const itemsToRemove = [
        'conversations',        // 对话历史
        'selectedModel',        // 模型选择
        'ai-parameters',        // AI参数配置
        'settings-active-tab',  // 设置页面标签状态
        'theme',               // 主题设置
        'gemini_video_webui_user_id', // 临时用户ID（保留认证用户ID）
        // 保留登录信息和语言设置
      ];
      
      let successCount = 0;
      let errorCount = 0;
      
      itemsToRemove.forEach(item => {
        const result = removeStorageItem(item);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          console.error(`Failed to remove ${item}:`, result.error);
        }
      });
      
      // 清理所有可能的临时和缓存数据
      const storageInfo = getStorageInfo();
      if (storageInfo.available) {
        storageInfo.keys.forEach(key => {
          if (key.includes('temp-') || 
              key.includes('cache-') || 
              key.includes('_timestamp') ||
              key.startsWith('debug-') ||
              key.startsWith('dev-') ||
              key.includes('session-') ||
              key.includes('scroll-') ||
              key.includes('state-') ||
              key.includes('form-')) {
            const result = removeStorageItem(key);
            if (result.success) {
              successCount++;
            } else {
              errorCount++;
            }
          }
        });
      }
      
      if (errorCount > 0) {
        alert(`深度缓存清除完成！成功: ${successCount}, 失败: ${errorCount}。页面将重新加载，大部分设置需要重新配置。`);
      } else {
        alert('深度缓存清除完成！页面将重新加载，大部分设置需要重新配置。');
      }
      
      // 刷新页面以应用更改
      window.location.reload();
    }
  };
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } | null>(null);
  
  // Get user info and auth methods
  const { user, isLoading: authLoading, changePassword } = useAuthStore();
  

  useEffect(() => {
    const loadData = async () => {
      await loadProviders();
      await loadConfigs();
    };
    loadData();
  }, []);

  // 独立的 useEffect 来处理 activeTab 恢复，依赖 providers 数据
  useEffect(() => {
    if (providers.length === 0) return; // 等待 providers 加载完成
    
    // 数据加载完成后，恢复或设置默认activeTab
    const savedTabResult = getStorageItem<string>('settings-active-tab');
    const savedTab = savedTabResult.success ? savedTabResult.data : null;
    
    // 检查保存的标签是否有效（包括固定标签和提供商ID）
    const isValidTab = savedTab && (
      savedTab === 'user-management' || 
      savedTab === 'language-settings' ||
      savedTab === 'cache-management' ||
      providers.some(provider => provider.id === savedTab)
    );
    
    if (isValidTab) {
      setActiveTabState(savedTab!);
    } else {
      // 如果没有有效的保存标签，默认选择第一个提供商
      const firstProvider = providers[0]?.id;
      if (firstProvider) {
        setActiveTabState(firstProvider);
        const result = setStorageItem('settings-active-tab', firstProvider);
        if (!result.success) {
          console.error('Failed to save active tab:', result.error);
        }
      }
    }
  }, [providers]); // 依赖 providers 数据

  // When configs are loaded, restore saved model data to providers state
  useEffect(() => {
    if (configs.length > 0) {
      // 清除之前的处理记录，允许重新处理新配置
      processedConfigsRef.current.clear();
      
      // Deduplicate configs, prioritize configuration with most models
      const uniqueConfigs = new Map<string, typeof configs[0]>();
      
      configs.forEach(config => {
        if (config.models && config.models.length > 0) {
          const existingConfig = uniqueConfigs.get(config.provider);
          // If no existing config, or current config has more models, use current config
          if (!existingConfig || config.models.length > (existingConfig.models?.length || 0)) {
            uniqueConfigs.set(config.provider, config);
          }
        }
      });
      
      // Use deduplicated config to restore model data
      uniqueConfigs.forEach((config) => {
        // Check if fetching models, if so don't override
        if (fetchingModels && fetchingModels[config.provider]) {
          return;
        }
        
        // Update models in providers state
        setProviders(prev => prev.map(p => {
          if (p.id === config.provider) {
            // 对于Ollama，如果已经有动态获取的模型，保持不变
            if (config.provider === 'ollama' && modelFetchResults[config.provider]?.success) {
              return p; // 保持现有的动态获取的模型
            }
            
            // 检查是否有动态获取的模型（对象格式）
            const hasDynamicModels = config.models?.some((model: any) => 
              model && typeof model === 'object' && ('id' in model || 'name' in model)
            );
            
            if (hasDynamicModels) {
              // 如果有动态模型，只使用动态模型，完全替换默认模型
              const dynamicModels = (config.models || []).filter((model: any) => 
                model && typeof model === 'object' && ('id' in model || 'name' in model)
              );
              
              // 分离普通模型和 Research 模型
              const regularModels: any[] = [];
              const researchModels: any[] = [];
              
              dynamicModels.forEach((model: any) => {
                const modelId = (model?.id || model?.name || '').toLowerCase();
                // 检查是否为 Research 模型
                if (modelId.includes('research') || 
                    modelId.includes('o3-deep-research') || 
                    modelId.includes('o4-mini-deep-research')) {
                  researchModels.push(model);
                } else {
                  regularModels.push(model);
                }
              });
              
              // 更新 modelFetchResults 以包含 Research 模型
              if (config.provider === 'openai' && (regularModels.length > 0 || researchModels.length > 0)) {
                // 使用 ref 跟踪是否已经处理过，避免重复更新
                const configKey = `${config.provider}-${regularModels.length}-${researchModels.length}`;
                if (!processedConfigsRef.current.has(configKey)) {
                  processedConfigsRef.current.add(configKey);
                  
                  setModelFetchResults(prev => ({
                    ...prev,
                    [config.provider]: {
                      success: true,
                      models: regularModels,
                      researchModels: researchModels,
                      message: 'settings.fetchModelsSuccess'
                    }
                  }));
                  
                  // 只在有 Research 模型时输出信息
                  if (researchModels.length > 0) {
                    console.log(`[INFO] 从后端配置恢复 ${config.provider} Research 模型:`, researchModels.map((m: any) => m.id || m.name));
                  }
                }
              }
              
              return { ...p, models: dynamicModels };
            } else {
              // 没有动态模型，使用所有配置的模型
              return { ...p, models: (config.models || []) as (string | { id?: string; name?: string; [key: string]: unknown })[] };
            }
          }
          return p;
        }));
        
        // 为Ollama设置默认测试模型为"auto"（但不更新模型列表）
        if (config.provider === 'ollama') {
          setTestModels(prev => ({
            ...prev,
            [config.provider]: prev[config.provider] || 'auto'
          }));
        }
      });
    }
  }, [configs, fetchingModels]); // 移除 modelFetchResults 依赖，避免无限循环


  // Password change handler
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword) {
      setPasswordError(t('auth.fillAllFields'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('auth.passwordMismatch'));
      return;
    }

    if (passwordValidation && !passwordValidation.isValid) {
      setPasswordError(t('auth.passwordTooWeak'));
      return;
    }

    try {
      const result = await changePassword(currentPassword, newPassword, confirmNewPassword);
      if (result.success) {
        setPasswordSuccess(result.message || t('auth.passwordChanged'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordValidation(null);
      } else {
        setPasswordError(result.error || t('auth.loginFailed'));
      }
    } catch (error) {
      setPasswordError(t('auth.operationFailed'));
    }
  };


  // 重置确认状态
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetLoading, setShowResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  // 重置所有模型到默认状态 - 清除后端数据库中的动态模型
  const resetAllModelsToDefault = async () => {
    setShowResetConfirm(true);
  };

  // 执行重置操作
  const executeReset = async () => {
    setShowResetConfirm(false);
    setShowResetLoading(true);
    setResetStatus({ status: 'loading', message: t('settings.resettingModels') });
    
    try {
      const userId = getUserId();
      if (!userId) {
        setShowResetLoading(false);
        setResetStatus({ status: 'error', message: t('auth.pleaseLogin') });
        return;
      }
      
      // 调用后端API直接清空JSON文件中的available_models字段
      const response = await fetch('/api/data/clear-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setResetStatus({ status: 'success', message: t('settings.resetSuccess', { count: result.data?.clearedCount || 0 }) });
          
          // 1.5秒后关闭加载弹窗并刷新页面
          setTimeout(() => {
            setShowResetLoading(false);
            window.location.reload();
          }, 1500);
        } else {
          setShowResetLoading(false);
          setResetStatus({ status: 'error', message: t('settings.resetFailed', { error: result.error || t('common.unknownError') }) });
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Reset models failed:', error);
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError');
      setShowResetLoading(false);
      setResetStatus({ status: 'error', message: t('settings.resetFailed', { error: errorMessage }) });
    }
    
    // 3秒后重置状态
    setTimeout(() => {
      setResetStatus({ status: 'idle', message: '' });
    }, 3000);
  };

  // 加载AI服务提供商
  const loadProviders = async () => {
    try {
      type KnownProviderId = 'openai' | 'claude' | 'gemini' | 'xai' | 'ollama';
      interface ApiProviderData { id: KnownProviderId; name: string; description?: string; }
      // 从API获取支持的提供商信息
      const response = await fetch('/api/providers/supported');
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // 将API返回的数据转换为前端需要的格式
          const apiProviders: AIProvider[] = result.data.map((provider: ApiProviderData) => {
            const fieldConfig: Record<KnownProviderId, AIProvider['fields']> = {
              openai: [
                {
                  name: 'api_key',
                  label: 'API Key',
                  type: 'password' as const,
                  required: true,
                  placeholder: 'sk-...',
                  description: t('providers.openai.apiKeyDescription')
                },
                {
                  name: 'base_url',
                  label: 'Base URL',
                  type: 'url' as const,
                  required: false,
                  placeholder: 'https://api.openai.com/v1',
                  description: t('providers.openai.baseUrlDescription')
                },
                {
                  name: 'use_responses_api',
                  label: t('providers.openai.useResponsesApi'),
                  type: 'boolean' as const,
                  required: false,
                  description: t('providers.openai.responsesApiDescription')
                },

              ],
              claude: [
                {
                  name: 'api_key',
                  label: 'API Key',
                  type: 'password' as const,
                  required: true,
                  placeholder: 'sk-ant-...',
                  description: t('providers.claude.apiKeyDescription')
                },
                {
                  name: 'base_url',
                  label: 'Base URL',
                  type: 'url' as const,
                  required: false,
                  placeholder: 'https://api.anthropic.com',
                  description: t('providers.claude.baseUrlDescription')
                },

              ],
              gemini: [
                {
                  name: 'api_key',
                  label: 'API Key',
                  type: 'password' as const,
                  required: true,
                  placeholder: 'AIza...',
                  description: t('providers.gemini.apiKeyDescription')
                },
                {
                  name: 'base_url',
                  label: 'Base URL',
                  type: 'url' as const,
                  required: false,
                  placeholder: 'https://generativelanguage.googleapis.com',
                  description: t('providers.gemini.baseUrlDescription')
                },

              ],
              xai: [
                {
                  name: 'api_key',
                  label: 'API Key',
                  type: 'password' as const,
                  required: true,
                  placeholder: 'xai-...',
                  description: t('providers.xai.apiKeyDescription')
                },
                {
                  name: 'base_url',
                  label: 'Base URL',
                  type: 'url' as const,
                  required: false,
                  placeholder: 'https://api.x.ai/v1',
                  description: t('providers.xai.baseUrlDescription')
                },

              ],
              ollama: [
                {
                  name: 'base_url',
                  label: 'Base URL',
                  type: 'url' as const,
                  required: true,
                  placeholder: 'http://localhost:11434',
                  description: t('providers.ollama.baseUrlDescription')
                },

              ]
            };
            
            const modelLists: Record<KnownProviderId, (string | { id?: string; name?: string; [key: string]: unknown; })[]> = {
                openai: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
                claude: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
                gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
                xai: ['grok-4', 'grok-3', 'grok-2-1212', 'grok-2-vision-1212'],
                ollama: [] // Ollama模型需要动态获取，不设置默认模型
            };

            return {
              id: provider.id,
              name: provider.name,
              description: t(`providers.${provider.id}.description`, `${provider.name} series models`),
              fields: fieldConfig[provider.id] || [],
              models: modelLists[provider.id] || []
            };
          });
          
          setProviders(apiProviders);
          console.log('[Settings] loadProviders完成，不自动设置activeTab');
        }
      } else {
        // Use fallback data when API call fails (2025 latest models)
        console.warn('API call failed, using fallback data');
        const fallbackProviders: AIProvider[] = [
          {
            id: 'openai',
            name: 'OpenAI',
            description: t('providers.openai.description'),
            fields: [
              {
                name: 'api_key',
                label: 'API Key',
                type: 'password',
                required: true,
                placeholder: 'sk-...',
                description: t('providers.openai.apiKeyDescription')
              },
              {
                name: 'base_url',
                label: 'Base URL',
                type: 'url',
                required: false,
                placeholder: 'https://api.openai.com/v1',
                description: t('providers.openai.baseUrlDescription')
              },
              {
                name: 'use_responses_api',
                label: t('providers.openai.useResponsesApi'),
                type: 'boolean',
                required: false,
                description: t('providers.openai.responsesApiDescription')
              }
            ],
            models: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
          },
          {
            id: 'claude',
            name: 'Anthropic Claude',
            description: t('providers.claude.description'),
            fields: [
              {
                name: 'api_key',
                label: 'API Key',
                type: 'password',
                required: true,
                placeholder: 'sk-ant-...',
                description: t('providers.claude.apiKeyDescription')
              },
              {
                name: 'base_url',
                label: 'Base URL',
                type: 'url',
                required: false,
                placeholder: 'https://api.anthropic.com',
                description: t('providers.claude.baseUrlDescription')
              }
            ],
            models: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022']
          },
          {
            id: 'gemini',
            name: 'Google Gemini',
            description: t('providers.gemini.description'),
            fields: [
              {
                name: 'api_key',
                label: 'API Key',
                type: 'password',
                required: true,
                placeholder: 'AIza...',
                description: t('providers.gemini.apiKeyDescription')
              },
              {
                name: 'base_url',
                label: 'Base URL',
                type: 'url',
                required: false,
                placeholder: 'https://generativelanguage.googleapis.com',
                description: t('providers.gemini.baseUrlDescription')
              }
            ],
            models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
          },
          {
            id: 'xai',
            name: 'xAI Grok',
            description: t('providers.xai.description'),
            fields: [
              {
                name: 'api_key',
                label: 'API Key',
                type: 'password',
                required: true,
                placeholder: 'xai-...',
                description: t('providers.xai.apiKeyDescription')
              },
              {
                name: 'base_url',
                label: 'Base URL',
                type: 'url',
                required: false,
                placeholder: 'https://api.x.ai/v1',
                description: t('providers.xai.baseUrlDescription')
              }
            ],
            models: ['grok-4', 'grok-3', 'grok-2-1212', 'grok-2-vision-1212']
          },
          {
            id: 'ollama',
            name: 'Ollama',
            description: t('providers.ollama.description'),
            fields: [
              {
                name: 'base_url',
                label: 'Base URL',
                type: 'url',
                required: true,
                placeholder: 'http://localhost:11434',
                description: t('providers.ollama.baseUrlDescription')
              }
            ],
            models: [] // Ollama模型需要动态获取，不设置默认模型
          }
        ];
        setProviders(fallbackProviders);
        console.log('[Settings] fallback providers设置完成，不自动设置activeTab');
      }
    } catch (error) {
      console.error('Failed to load AI service providers:', error);
      // Use fallback data on error
      const fallbackProviders: AIProvider[] = [
        {
          id: 'openai',
          name: 'OpenAI',
          description: t('providers.openai.description'),
          fields: [
            {
              name: 'api_key',
              label: 'API Key',
              type: 'password',
              required: true,
              placeholder: 'sk-...',
              description: t('providers.openai.apiKeyDescription')
            },
            {
              name: 'base_url',
              label: 'Base URL',
              type: 'url',
              required: false,
              placeholder: 'https://api.openai.com/v1',
              description: t('providers.openai.baseUrlDescription')
            },
            {
              name: 'use_responses_api',
              label: t('providers.openai.useResponsesApi'),
              type: 'boolean',
              required: false,
              description: t('providers.openai.responsesApiDescription')
            }
          ],
          models: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
        }
      ];
      setProviders(fallbackProviders);
      console.log('[Settings] error fallback providers设置完成，不自动设置activeTab');
    }
  };

  const loadConfigs = async () => {
    try {
      const userId = getUserId();
      
      // Get user configured AI service providers
      const response = await fetch(`/api/providers/config?userId=${encodeURIComponent(userId)}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const configs: ProviderConfig[] = result.data.map((config: any) => {
            // 过滤出配置字段，排除系统字段
            const { 
              id, user_id, provider_name, available_models, default_model, 
              is_active, created_at, updated_at, ...configFields 
            } = config;
            
            return {
              provider: config.provider_name,
              config: configFields, // 包含所有的配置字段（api_key, base_url, use_responses_api等）
              model: config.default_model || '',
              is_default: false,
              models: config.available_models || []
            };
          });
          setConfigs(configs);
        } else {
          // 如果没有配置，使用空数组
          setConfigs([]);
        }
      } else {
        console.warn('加载配置失败，使用空配置');
        setConfigs([]);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      setConfigs([]);
    } finally {
      // 移除全局loading状态，让设置页面立即显示
      setIsLoading(false);
    }
  };

  const getProviderConfig = (providerId: string): ProviderConfig | undefined => {
    return configs.find(config => config.provider === providerId);
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
          newConfig.config = {
            ...newConfig.config,
            [field]: value as string
          };
        }
        updated[existingIndex] = newConfig;

        // 如果是默认模型更新，同步更新localStorage
        if (field === 'model') {
          const model = value as string;
          const selectedModelData = {
            provider: providerId,
            providerName: getProviderDisplayName(providerId),
            model: model,
            displayName: model
          };
          const result = setStorageItem('selectedModel', selectedModelData);
          if (!result.success) {
            console.error('Failed to save selected model:', result.error);
          }
        }

        return updated;
      } else {
        // 如果配置不存在，创建新配置
        const provider = providers.find(p => p.id === providerId);
        if (!provider) return prev;

        let defaultModel = '';
        if (provider.models.length > 0) {
          if (providerId === 'ollama') {
            // 对于Ollama，使用智能算法选择中等大小的默认模型
            defaultModel = selectSmartDefaultModel(provider.models, providerId, 'default') || '';
          } else {
            // 其他提供商使用第一个模型
            defaultModel = typeof provider.models[0] === 'string' ? provider.models[0] : provider.models[0]?.id || provider.models[0]?.name || '';
          }
        }

        const newProviderConfig: ProviderConfig = {
          provider: providerId,
          config: {},
          model: defaultModel,
          is_default: false,
        };

        if (field === 'models') {
          newProviderConfig.models = value as (string | { id?: string; name?: string; [key: string]: unknown })[];
        } else {
          newProviderConfig.config[field] = value as string;
        }

        return [...prev, newProviderConfig];
      }
    });
    
    // 自动保存功能
    if (autoSaveEnabled) {
      // 清除之前的定时器
      if (autoSaveTimeouts[providerId]) {
        clearTimeout(autoSaveTimeouts[providerId]);
      }
      
      // 设置新的定时器，延迟1秒后自动保存
      const timeoutId = setTimeout(() => {
        saveConfig(providerId, true); // 静默保存
      }, 1000);
      
      setAutoSaveTimeouts(prev => ({
        ...prev,
        [providerId]: timeoutId
      }));
    }
  };

  const updateModel = (providerId: string, model: string, autoSaveEnabled: boolean = true) => {
    setConfigs(prev => {
      const existingIndex = prev.findIndex(config => config.provider === providerId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          model
        };
        
        // 同步到localStorage，让主页的ModelSelector能读取到
        const selectedModelData = {
          provider: providerId,
          providerName: getProviderDisplayName(providerId),
          model: model,
          displayName: model
        };
        const result = setStorageItem('selectedModel', selectedModelData);
        if (!result.success) {
          console.error('Failed to save selected model:', result.error);
        }
        
        // 不在这里触发事件，由saveConfig统一处理
        
        return updated;
      }
      return prev;
    });
    
    // 自动保存功能
    if (autoSaveEnabled) {
      // 清除之前的定时器
      if (autoSaveTimeouts[providerId]) {
        clearTimeout(autoSaveTimeouts[providerId]);
      }
      
      // 设置新的定时器，延迟1秒后自动保存
      const timeoutId = setTimeout(() => {
        saveConfig(providerId, true); // 静默保存
      }, 1000);
      
      setAutoSaveTimeouts(prev => ({
        ...prev,
        [providerId]: timeoutId
      }));
    }
  };

  const getProviderDisplayName = (providerId: string): string => {
    const providerNames: { [key: string]: string } = {
      'openai': 'OpenAI',
 
      'claude': 'Anthropic Claude',
      'gemini': 'Google Gemini',
      'xai': 'xAI Grok',
      'ollama': 'Ollama'
    };
    return providerNames[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  const setAsDefault = (providerId: string) => {
    setConfigs(prev => prev.map(config => ({
      ...config,
      is_default: config.provider === providerId
    })));
  };

  // 手动保存配置
  const manualSaveConfig = async (providerId: string) => {
    setManualSaving(prev => ({
      ...prev,
      [providerId]: true
    }));
    
    // 清除自动保存定时器
    if (autoSaveTimeouts[providerId]) {
      clearTimeout(autoSaveTimeouts[providerId]);
      setAutoSaveTimeouts(prev => {
        const updated = { ...prev };
        delete updated[providerId];
        return updated;
      });
    }
    
    await saveConfig(providerId, false, true);
  };

  const saveConfig = async (providerId: string, silent: boolean = false, isManual: boolean = false) => {
    try {
      const config = getProviderConfig(providerId);
      if (!config) {
        throw new Error('配置不存在');
      }

      // 检查是否要清除配置（必填字段为空）
      const shouldClearConfig = (providerId === 'ollama' && (!config.config.base_url || config.config.base_url.trim() === '')) ||
                               (providerId !== 'ollama' && (!config.config.api_key || config.config.api_key.trim() === ''));
      
      if (shouldClearConfig) {
        // 清除配置：删除后端配置并清理前端状态
        const userId = getUserId();
        const response = await fetch(`/api/providers/config?userId=${encodeURIComponent(userId)}&providerName=${encodeURIComponent(providerId)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          // 清除前端配置状态
          setConfigs(prev => prev.filter(c => c.provider !== providerId));
          
          // 清除模型获取结果
          setModelFetchResults(prev => {
            const updated = { ...prev };
            delete updated[providerId];
            return updated;
          });
          
          // 清除测试结果
          setTestResults(prev => {
            const updated = { ...prev };
            delete updated[providerId];
            return updated;
          });
          
          // 保存成功状态
          if (!silent) {
            setSaveStatus(prev => ({
              ...prev,
              [providerId]: { status: 'success', message: isManual ? '配置已手动清除' : '配置已清除', timestamp: Date.now() }
            }));
            
            // 手动操作立即清除状态，自动操作3秒后清除
            const clearDelay = isManual ? 800 : 3000;
            setTimeout(() => {
              setSaveStatus(prev => ({
                ...prev,
                [providerId]: { status: 'idle', message: '' }
              }));
            }, clearDelay);
          }
          
          console.log('配置已清除:', providerId);
          return;
        } else {
          throw new Error('清除配置失败');
        }
      }

      // 验证必填字段（正常保存流程）
      if (providerId !== 'ollama' && !config.config.api_key) {
        throw new Error('API Key 是必填项');
      }
      
      // 检查Ollama的base_url
      if (providerId === 'ollama' && !config.config.base_url) {
        throw new Error('Base URL 是必填项');
      }

      const userId = getUserId();
      const response = await fetch('/api/providers/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          providerName: providerId,
          apiKey: config.config.api_key,
          baseUrl: config.config.base_url,
          availableModels: config.models || modelFetchResults[providerId]?.models || [],
          defaultModel: config.model,
          // 包含所有额外的配置字段
          extraConfig: config.config
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '保存配置失败');
      }
      
      // 保存成功后，同步到localStorage，让主页的ModelSelector能读取到
      const selectedModelData = {
        provider: providerId,
        providerName: getProviderDisplayName(providerId),
        model: config.model,
        displayName: config.model
      };
      const storageResult = setStorageItem('selectedModel', selectedModelData);
      if (!storageResult.success) {
        console.error('Failed to save selected model:', storageResult.error);
      }
      
      // 只在配置保存成功后触发事件，通知ModelSelector更新
      window.dispatchEvent(new Event('localStorageChanged'));
      
      // 保存成功状态
      if (!silent) {
        setSaveStatus(prev => ({
          ...prev,
          [providerId]: { status: 'success', message: isManual ? '配置已手动保存' : '配置已保存', timestamp: Date.now() }
        }));
        
        // 手动保存立即清除状态，自动保存3秒后清除
        const clearDelay = isManual ? 800 : 3000;
        setTimeout(() => {
          setSaveStatus(prev => ({
            ...prev,
            [providerId]: { status: 'idle', message: '' }
          }));
        }, clearDelay);
      }
      
      console.log('配置保存成功:', result.data);
    } catch (error) {
      console.error('保存自定义模型失败:', error as Error);
      
      console.error('保存配置失败:', error);
      if (!silent) {
        setSaveStatus(prev => ({
          ...prev,
          [providerId]: { status: 'error', message: isManual ? '手动保存失败，请重试' : '保存失败，请重试', timestamp: Date.now() }
        }));
        
        // 5秒后清除错误状态
        setTimeout(() => {
          setSaveStatus(prev => ({
            ...prev,
            [providerId]: { status: 'idle', message: '' }
          }));
        }, 5000);
      }
    } finally {
      // 清除手动保存loading状态
      if (isManual) {
        setManualSaving(prev => ({
          ...prev,
          [providerId]: false
        }));
      }
    }
  };

  const testConnection = async (providerId: string) => {
    try {
      setTestingProvider(providerId);
      const config = getProviderConfig(providerId);
      
      if (!config) {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            message: '请先配置提供商信息'
          }
        }));
        return;
      }

      // Ollama需要先获取模型列表
      if (providerId === 'ollama') {
        const modelResults = modelFetchResults[providerId];
        if (!modelResults || !modelResults.success || modelResults.models.length === 0) {
          setTestResults(prev => ({
            ...prev,
            [providerId]: {
              success: false,
              message: 'Ollama需要先获取模型列表。请点击"获取模型列表"按钮获取已安装的模型，然后选择一个模型进行测试。'
            }
          }));
          return;
        }
        
        if (!testModels[providerId] || testModels[providerId] === 'auto') {
          // 如果是auto或未选择，使用智能选择的模型
          const modelResults = modelFetchResults[providerId];
          if (modelResults?.success && modelResults.models.length > 0) {
            const autoSelectedModel = selectSmartDefaultModel(modelResults.models, providerId, 'test');
            if (!autoSelectedModel) {
              setTestResults(prev => ({
                ...prev,
                [providerId]: {
                  success: false,
                  message: '无法自动选择测试模型，请手动选择一个模型。'
                }
              }));
              return;
            }
          } else {
            setTestResults(prev => ({
              ...prev,
              [providerId]: {
                success: false,
                message: '请先选择一个模型进行测试。'
              }
            }));
            return;
          }
        }
      }

      // 验证必填字段（Ollama不需要API Key）
      if (providerId !== 'ollama' && !config.config.api_key) {
        setTestResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            message: 'API Key 是必填项'
          }
        }));
        return;
      }
      
      const response = await fetch('/api/providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerName: providerId,
          apiKey: config.config.api_key,
          baseUrl: config.config.base_url,
          model: (() => {
            // 如果选择了auto，使用智能选择的模型
            if (testModels[providerId] === 'auto' && providerId === 'ollama') {
              const modelResults = modelFetchResults[providerId];
              if (modelResults?.success && modelResults.models.length > 0) {
                return selectSmartDefaultModel(modelResults.models, providerId, 'test') || config.model || 'default';
              }
            }
            return testModels[providerId] || config.model || 'default';
          })()
        })
      });

      const result = await response.json();
      
      const testModel = (() => {
        // 如果选择了auto，显示实际使用的智能选择模型
        if (testModels[providerId] === 'auto' && providerId === 'ollama') {
          const modelResults = modelFetchResults[providerId];
          if (modelResults?.success && modelResults.models.length > 0) {
            const autoSelected = selectSmartDefaultModel(modelResults.models, providerId, 'test');
            return autoSelected ? `${autoSelected} (自动选择)` : (config.model || 'default');
          }
        }
        return testModels[providerId] || config.model || 'default';
      })();
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: result.success,
          message: result.success 
            ? `连接测试成功！使用模型: ${testModel}` 
            : (result.error || '连接测试失败，请检查配置。')
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          message: error instanceof Error ? error.message : '测试过程中发生错误'
        }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const togglePasswordVisibility = (providerId: string, fieldName: string) => {
    const key = `${providerId}-${fieldName}`;
    setShowPasswords(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 智能选择默认模型（测试用：优先选择最小模型，默认用：优先选择实用模型）
  const selectSmartDefaultModel = (models: any[], providerId: string, purpose: 'test' | 'default' = 'default') => {
    if (!models || models.length === 0) return null;
    
    // 如果只有一个模型，直接选择
    if (models.length === 1) {
      return models[0].id || models[0].name || models[0];
    }
    
    // 对于Ollama，根据模型名称判断大小
    if (providerId === 'ollama') {
      // 提取模型大小信息
      const getSizeScore = (name: string) => {
        // 匹配 B 单位参数 (如 1b, 7b, 13b)
        const bMatch = name.match(/(\d+\.?\d*)b/);
        if (bMatch) {
          return parseFloat(bMatch[1]);
        }
        
        // 匹配 M 单位参数 (如 270m, 1.5m) - 转换为 B 单位
        const mMatch = name.match(/(\d+\.?\d*)m/);
        if (mMatch) {
          return parseFloat(mMatch[1]) / 1000; // 270m = 0.27b
        }
        
        // 根据常见模型名称关键词判断
        if (name.includes('nano') || name.includes('tiny')) return 0.1;
        if (name.includes('mini') || name.includes('small')) return 1;
        if (name.includes('medium')) return 7;
        if (name.includes('large')) return 13;
        if (name.includes('xl') || name.includes('extra')) return 70;
        
        // 移除了特殊模型系列的定制识别逻辑
        
        return 999; // 未知大小的模型，给一个很大的值
      };

      if (purpose === 'test') {
        // 测试模型：选择最小的模型
        const sortedModels = [...models].sort((a, b) => {
          const aName = (a.id || a.name || a || '').toString().toLowerCase();
          const bName = (b.id || b.name || b || '').toString().toLowerCase();
          return getSizeScore(aName) - getSizeScore(bName);
        });
        
        const selectedModel = sortedModels[0];
        return selectedModel?.id || selectedModel?.name || selectedModel || null;
      } else if (purpose === 'default') {
        // 默认模型：智能选择策略
        const modelsWithSize = models.map(model => ({
          ...model,
          size: getSizeScore((model.id || model.name || model || '').toString().toLowerCase())
        })).filter(model => model.size < 999); // 排除未知大小的模型
        
        console.log(`[DEBUG] Ollama默认模型选择 - 所有已知大小模型:`, modelsWithSize.map(m => `${m.id || m.name}: ${m.size}b`));
        
        if (modelsWithSize.length === 0) {
          // 如果所有模型都是未知大小，选择最小的可用模型
          const sortedModels = [...models].sort((a, b) => {
            const aName = (a.id || a.name || a || '').toString().toLowerCase();
            const bName = (b.id || b.name || b || '').toString().toLowerCase();
            return getSizeScore(aName) - getSizeScore(bName);
          });
          const selectedModel = sortedModels[0];
          console.log(`[DEBUG] 所有模型大小未知，选择第一个:`, selectedModel?.id || selectedModel?.name || selectedModel);
          return selectedModel?.id || selectedModel?.name || selectedModel;
        }
        
        // 智能选择策略：
        // 1. 优先选择 1b-15b 范围内最接近7b的模型
        // 2. 如果没有，选择 0.5b-1b 范围内最大的模型  
        // 3. 如果没有，选择 15b-20b 范围内最小的模型
        // 4. 最后才考虑更大的模型
        
        // 第一优先级：1b-15b 范围（主流模型）
        const primaryModels = modelsWithSize.filter(model => model.size >= 1 && model.size <= 15);
        
        if (primaryModels.length > 0) {
          // 在主流模型中选择最接近7b的
          const targetSize = 7;
          const bestModel = primaryModels.reduce((best, current) => {
            const bestDiff = Math.abs(best.size - targetSize);
            const currentDiff = Math.abs(current.size - targetSize);
            return currentDiff < bestDiff ? current : best;
          });
          console.log(`[DEBUG] 选择主流模型(1-15b)中最接近7b的:`, bestModel?.id || bestModel?.name, `(${bestModel?.size}b)`);
          return bestModel?.id || bestModel?.name;
        }
        
        // 第二优先级：0.5b-1b 小模型（选择最大的，即最接近1b）
        const smallModels = modelsWithSize.filter(model => model.size >= 0.5 && model.size < 1);
        
        if (smallModels.length > 0) {
          const bestSmallModel = smallModels.reduce((best, current) => {
            return current.size > best.size ? current : best; // 选择最大的小模型
          });
          console.log(`[DEBUG] 选择小模型(0.5-1b)中最大的:`, bestSmallModel?.id || bestSmallModel?.name, `(${bestSmallModel?.size}b)`);
          return bestSmallModel?.id || bestSmallModel?.name;
        }
        
        // 第三优先级：15b-20b 中等偏大模型（选择最小的）
        const mediumLargeModels = modelsWithSize.filter(model => model.size > 15 && model.size <= 20);
        
        if (mediumLargeModels.length > 0) {
          const bestMediumLargeModel = mediumLargeModels.reduce((best, current) => {
            return current.size < best.size ? current : best; // 选择最小的中大模型
          });
          console.log(`[DEBUG] 选择中大模型(15-20b)中最小的:`, bestMediumLargeModel?.id || bestMediumLargeModel?.name, `(${bestMediumLargeModel?.size}b)`);
          return bestMediumLargeModel?.id || bestMediumLargeModel?.name;
        }
        
        // 第四优先级：超小模型 < 0.5b（选择最大的，避免选择过小无用的模型）
        const tinyModels = modelsWithSize.filter(model => model.size < 0.5);
        
        if (tinyModels.length > 0) {
          const bestTinyModel = tinyModels.reduce((best, current) => {
            return current.size > best.size ? current : best; // 选择最大的超小模型
          });
          console.log(`[DEBUG] 选择超小模型(<0.5b)中最大的:`, bestTinyModel?.id || bestTinyModel?.name, `(${bestTinyModel?.size}b)`);
          return bestTinyModel?.id || bestTinyModel?.name;
        }
        
        // 最后选择：大模型 > 20b（选择最小的）
        const largeModels = modelsWithSize.filter(model => model.size > 20);
        
        if (largeModels.length > 0) {
          const bestLargeModel = largeModels.reduce((best, current) => {
            return current.size < best.size ? current : best; // 选择最小的大模型
          });
          console.log(`[DEBUG] 选择大模型(>20b)中最小的:`, bestLargeModel?.id || bestLargeModel?.name, `(${bestLargeModel?.size}b)`);
          return bestLargeModel?.id || bestLargeModel?.name;
        }
      }
    }
    
    return null;
  };

  // 获取模型列表
  const fetchModels = async (providerId: string) => {
    if (fetchingModels && (fetchingModels as any)[providerId]) return;
    
    setFetchingModels(prev => {
      const currentState = prev || {};
      return {
        ...currentState,
        [providerId]: true
      };
    });
    
    try {
      const config = getProviderConfig(providerId);
      if (!config || (providerId !== 'ollama' && !config.config.api_key)) {
        setModelFetchResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            models: [],
            researchModels: [],
            message: providerId === 'ollama' ? '请先配置服务器地址' : '请先配置API密钥'
          }
        }));
        return;
      }

      const response = await fetch('/api/providers/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerName: providerId,
          apiKey: config.config.api_key,
          baseUrl: config.config.base_url
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const allModels = result.data.models || [];
        
        // 分离普通模型和 Research 模型
        const regularModels: any[] = [];
        const researchModels: any[] = [];
        
        allModels.forEach((model: any) => {
          const modelId = (typeof model === 'string' ? model : model?.id || model?.name || '').toLowerCase();
          
          // 使用与后端一致的模式匹配筛选 Research 模型
          if (modelId.includes('-research') || 
              modelId.includes('deep-research') || 
              modelId.endsWith('-research') || 
              modelId.endsWith('research')) {
            researchModels.push(model);
          } else {
            regularModels.push(model);
          }
        });
        
        // 移除模拟数据逻辑，依赖真实 API 数据
        // if (providerId === 'openai' && researchModels.length === 0) {
        //   researchModels.push(
        //     { id: 'o3-deep-research-2025-06-26', name: 'o3-deep-research-2025-06-26' },
        //     { id: 'o4-mini-deep-research-2025-06-26', name: 'o4-mini-deep-research-2025-06-26' }
        //   );
        // }
        
        console.log(`[DEBUG] ${providerId} 模型分离结果:`);
        console.log(`[DEBUG] - 普通模型 (${regularModels.length}):`, regularModels.map((m: any) => m.id || m.name || m));
        console.log(`[DEBUG] - Research模型 (${researchModels.length}):`, researchModels.map((m: any) => m.id || m.name || m));
        
        // 合并所有模型用于保存到后端（包括 Research 模型）
        const allModelsForSaving = [...regularModels, ...researchModels];
        console.log(`[DEBUG] - Research模型 (${researchModels.length}):`, researchModels.map((m: any) => m.id || m.name || m));
        
        // 智能选择测试模型（从普通模型中选择）
        const testModel = selectSmartDefaultModel(regularModels, providerId, 'test');
        // 智能选择默认模型（从普通模型中选择）
        const defaultModel = selectSmartDefaultModel(regularModels, providerId, 'default');
        
        console.log(`[DEBUG] ${providerId} 获取模型列表后选择:`);
        console.log(`[DEBUG] - 测试模型 (test): ${testModel}`);
        console.log(`[DEBUG] - 默认模型 (default): ${defaultModel}`);
        console.log(`[DEBUG] - 普通模型数量: ${regularModels.length}`);
        console.log(`[DEBUG] - Research模型数量: ${researchModels.length}`);
        
        
        if (providerId === 'ollama') {
          // 不自动设置测试模型，保持'auto'状态让用户看到"自动选择"
          // 只设置默认模型到配置中
          console.log(`[DEBUG] 即将为Ollama设置默认模型: ${defaultModel}`);
          if (defaultModel) {
            updateModel(providerId, defaultModel);
            console.log(`[DEBUG] 已调用updateModel设置默认模型: ${defaultModel}`);
          } else {
            console.log(`[DEBUG] 警告: defaultModel为null，未设置默认模型`);
          }
        }
        
        setModelFetchResults(prev => ({
          ...prev,
          [providerId]: {
            success: true,
            models: regularModels,
            researchModels: researchModels,
            message: providerId === 'ollama' && regularModels.length > 0 
              ? `${t('settings.fetchModelsSuccess')} 已自动选择默认模型: ${defaultModel}, 测试模型: ${testModel}`
              : t('settings.fetchModelsSuccess')
          }
        }));
        setTimeout(async () => {
          try {
            const updatedConfig = getProviderConfig(providerId);
            if (updatedConfig) {
              const userId = getUserId();
              console.log(`[DEBUG] 即将向后端发送的参数:`, {
                userId,
                providerName: providerId,
                apiKey: updatedConfig.config.api_key,
                baseUrl: updatedConfig.config.base_url,
                availableModels: allModelsForSaving, // 保存所有模型（包括 Research）
                defaultModel: defaultModel
              });
              const response = await fetch('/api/providers/config', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId,
                  providerName: providerId,
                  apiKey: updatedConfig.config.api_key,
                  baseUrl: updatedConfig.config.base_url,
                  availableModels: allModelsForSaving, // 保存所有模型（包括 Research）
                  defaultModel: defaultModel
                })
              });
              
              if (response.ok) {
                // 触发模型列表更新事件，通知ModelSelector刷新
                window.dispatchEvent(new Event('modelsUpdated'));
                console.log('模型列表已保存并同步到ModelSelector');
                
                // 检查保存到后端的配置
                const saveResult = await response.json();
                console.log(`[DEBUG] 保存到后端的配置结果:`, saveResult);
                
                // 重新加载配置以更新设置页面的模型显示
                console.log(`[DEBUG] 准备重新加载配置前，当前Ollama模型是:`, getProviderConfig('ollama')?.model);
                await loadConfigs();
                console.log(`[DEBUG] 重新加载配置后，Ollama模型变成:`, getProviderConfig('ollama')?.model);
              }
            }
          } catch (error) {
            console.error('保存获取的模型列表失败:', error);
          }
        }, 100);
      } else {
        // 处理失败情况：后端返回 success: false 或没有模型数据
        const errorMessage = result.error || '获取模型列表失败';
        console.error(`${providerId}获取模型失败:`, errorMessage);
        
        setModelFetchResults(prev => ({
          ...prev,
          [providerId]: {
            success: false,
            models: [],
            researchModels: [],
            message: errorMessage
          }
        }));
      }
    } catch (error) {
      // 网络错误或其他未预期的错误
      console.error(`${providerId}获取模型网络错误:`, error);
      setModelFetchResults(prev => ({
        ...prev,
        [providerId]: {
          success: false,
          models: [],
          researchModels: [],
          message: '网络错误，请检查连接'
        }
      }));
    } finally {
      setFetchingModels(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Link
                  to="/"
                  className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mr-4"
                >
                  <ArrowLeft className="w-5 h-5 mr-1" />
                  {t('common.back')}
                </Link>
                <SettingsIcon className="w-8 h-8 text-blue-600 mr-3" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {t('settings.aiProviders')}
                  </p>
                </div>
              </div>
              
              {/* 清除缓存按钮 */}
              <div className="flex flex-col items-end space-y-2">
                <button
                  onClick={resetAllModelsToDefault}
                  disabled={resetStatus.status === 'loading'}
                  className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${resetStatus.status === 'loading' ? 'animate-spin' : ''}`} />
                  {resetStatus.status === 'loading' ? t('common.loading') : t('settings.resetModels')}
                </button>
                
                {/* 状态提示 */}
                {resetStatus.status !== 'idle' && (
                  <div className={`text-sm px-3 py-1 rounded-md ${
                    resetStatus.status === 'success' ? 'text-green-700 bg-green-50 border border-green-200' :
                    resetStatus.status === 'error' ? 'text-red-700 bg-red-50 border border-red-200' :
                    'text-blue-700 bg-blue-50 border border-blue-200'
                  }`}>
                    {resetStatus.message}
                  </div>
                )}
                
                {/* 确认对话框 */}
                {showResetConfirm && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">确认重置</h3>
                      <p className="text-sm text-gray-600 mb-6">
                        确定要重置所有模型吗？这会删除所有通过"获取模型列表"获取的动态模型，恢复到代码预设的默认模型列表。
                      </p>
                      <div className="flex justify-end space-x-3">
                        <button
                          onClick={() => setShowResetConfirm(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={executeReset}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                        >
                          确认重置
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 加载弹窗 */}
                {showResetLoading && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-8 max-w-sm mx-4 shadow-xl">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">正在重置模型</h3>
                        <p className="text-sm text-gray-600 text-center">
                          {resetStatus.message}
                        </p>
                        {resetStatus.status === 'success' && (
                          <div className="mt-3 flex items-center text-green-600">
                            <Check className="w-5 h-5 mr-2" />
                            <span className="text-sm font-medium">重置完成，即将刷新页面...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 侧边栏 */}
          <div className="lg:w-64">
            <nav className="space-y-1">
              {providers.map((provider) => {
                const config = getProviderConfig(provider.id);
                // 检查配置是否有效：对于非Ollama提供商需要API Key，对于Ollama需要base_url
                const isConfigured = config && 
                  (provider.id === 'ollama' 
                    ? config.config.base_url && config.config.base_url.trim() !== ''
                    : config.config.api_key && config.config.api_key.trim() !== '');
                
                return (
                  <button
                    key={provider.id}
                    onClick={() => setActiveTab(provider.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                      activeTab === provider.id
                        ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-500'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{provider.name}</span>
                      <div className="flex items-center space-x-1">
                        {config?.is_default && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            默认
                          </span>
                        )}
                        {isConfigured && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              
              {/* 用户管理标签 */}
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => setActiveTab('user-management')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'user-management'
                      ? 'bg-indigo-100 text-indigo-700 border-r-2 border-indigo-500'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    <span>{t('settings.userManagement')}</span>
                  </div>
                </button>
                
                {/* 语言设置标签 */}
                <button
                  onClick={() => setActiveTab('language-settings')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'language-settings'
                      ? 'bg-green-100 text-green-700 border-r-2 border-green-500'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <Globe className="w-4 h-4 mr-2" />
                    <span>{t('settings.languageSettings')}</span>
                  </div>
                </button>
                
                {/* 缓存管理标签 */}
                <button
                  onClick={() => setActiveTab('cache-management')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    activeTab === 'cache-management'
                      ? 'bg-orange-100 text-orange-700 border-r-2 border-orange-500'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>缓存管理</span>
                  </div>
                </button>
              </div>
            </nav>
          </div>

          {/* 主内容区 */}
          <div className="flex-1">
            {providers.map((provider) => {
              if (activeTab !== provider.id) return null;
              
              const config = getProviderConfig(provider.id);
              const testResult = testResults[provider.id];
              
              return (
                <div key={provider.id} className="bg-white rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-medium text-gray-900">{provider.name}</h2>
                        <p className="mt-1 text-sm text-gray-500">{provider.description}</p>
                      </div>
                      {config && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setAsDefault(provider.id)}
                            disabled={config.is_default}
                            className={`px-3 py-1 text-xs font-medium rounded-md ${
                              config.is_default
                                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {config.is_default ? '默认服务' : '设为默认'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-6">
                    <div className="space-y-6">
                      {/* 配置字段 */}
                      {provider.fields.map((field) => {
                        const fieldValue = config?.config[field.name] || '';
                        const showPasswordKey = `${provider.id}-${field.name}`;
                        const showPassword = showPasswords[showPasswordKey];
                        
                        return (
                          <div key={field.name}>
                            <label htmlFor={`${provider.id}-${field.name}`} className="block text-sm font-medium text-gray-700 mb-2">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {field.type === 'boolean' ? (
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => updateConfig(provider.id, field.name, fieldValue === 'true' ? 'false' : 'true', true)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                                    fieldValue === 'true' ? 'bg-blue-600' : 'bg-gray-200'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      fieldValue === 'true' ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                                <span className="ml-3 text-sm text-gray-600">
                                  {fieldValue === 'true' ? t('settings.enabled') : t('settings.disabled')}
                                </span>
                                {/* 如果是 OpenAI 的 Responses API 开关，显示测试按钮 */}
                                {provider.id === 'openai' && field.name === 'use_responses_api' && fieldValue === 'true' && (
                                  <button
                                    onClick={async () => {
                                      const config = getProviderConfig(provider.id);
                                      if (!config?.config.api_key) {
                                        alert('请先配置 API Key');
                                        return;
                                      }
                                      
                                      setTestingProvider(`${provider.id}-responses`);
                                      try {
                                        const response = await fetch('/api/chat', {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: JSON.stringify({
                                            message: 'Hello! 这是一个 Responses API 测试。',
                                            provider: 'openai',
                                            model: config.model || 'gpt-4o',
                                            userId: getUserId(), // 使用真实的用户ID
                                            parameters: {
                                              temperature: 0.7,
                                              maxTokens: 50,
                                              useResponsesAPI: true // 添加标识使用Responses API
                                            }
                                          })
                                        });
                                        
                                        const result = await response.json();
                                        
                                        setTestResults(prev => ({
                                          ...prev,
                                          [`${provider.id}-responses`]: {
                                            success: result.success,
                                            message: result.success 
                                              ? `Responses API 测试成功！响应内容: ${result.response ? result.response.slice(0, 50) + '...' : '无'}` 
                                              : `Responses API 测试失败: ${result.error || '未知错误'}`
                                          }
                                        }));
                                      } catch (error) {
                                        setTestResults(prev => ({
                                          ...prev,
                                          [`${provider.id}-responses`]: {
                                            success: false,
                                            message: `Responses API 测试失败: ${error instanceof Error ? error.message : '网络错误'}`
                                          }
                                        }));
                                      } finally {
                                        setTestingProvider(null);
                                      }
                                    }}
                                    disabled={testingProvider === `${provider.id}-responses`}
                                    className="ml-3 inline-flex items-center px-3 py-1 border border-blue-300 text-xs font-medium rounded text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Zap className="w-3 h-3 mr-1" />
                                    {testingProvider === `${provider.id}-responses` ? t('settings.testing') : t('settings.test')}
                                  </button>
                                )}
                              </div>
                            ) : field.type === 'number' ? (
                              <div className="relative">
                                <input
                                  id={`${provider.id}-${field.name}`}
                                  name={`${provider.id}-${field.name}`}
                                  type="number"
                                  value={fieldValue}
                                  onChange={(e) => updateConfig(provider.id, field.name, e.target.value)}
                                  placeholder={field.placeholder}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  min={field.min}
                                  max={field.max}
                                  step={field.step}
                                />
                              </div>
                            ) : (
                              <div className="relative">
                                <input
                                  id={`${provider.id}-${field.name}`}
                                  name={`${provider.id}-${field.name}`}
                                  type={field.type === 'password' && !showPassword ? 'password' : 'text'}
                                  value={fieldValue}
                                  onChange={(e) => updateConfig(provider.id, field.name, e.target.value)}
                                  placeholder={field.placeholder}
                                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {field.type === 'password' && (
                                  <button
                                    type="button"
                                    onClick={() => togglePasswordVisibility(provider.id, field.name)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-4 w-4 text-gray-400" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-gray-400" />
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                            {field.description && (
                              <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                            )}
                          </div>
                        );
                      })}

                      {/* 模型选择 */}
                      {(provider.models.length > 0 || (provider.id === 'ollama' && modelFetchResults[provider.id]?.success && modelFetchResults[provider.id]?.models.length > 0)) && (
                        <div>
                          <label htmlFor={`${provider.id}-default-model`} className="block text-sm font-medium text-gray-700 mb-2">
                            {t('settings.defaultModel')}
                          </label>
                          <select
                            id={`${provider.id}-default-model`}
                            name={`${provider.id}-default-model`}
                            value={config?.model || ''}
                            onChange={(e) => updateModel(provider.id, e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="" disabled>选择默认模型</option>
                            {(provider.id === 'ollama' && modelFetchResults[provider.id]?.success ? modelFetchResults[provider.id].models : provider.models).map((model, index) => {
                              const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                              const modelName = typeof model === 'string' ? convertModelIdToDisplayName(model) : model?.name || convertModelIdToDisplayName(model?.id || '') || `Model ${index + 1}`;
                              return (
                                <option key={`${provider.id}-${modelId}-${index}`} value={modelId}>
                                  {modelName}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {/* 测试模型选择器 */}
                      {(provider.models.length > 0 || (provider.id === 'ollama' && modelFetchResults[provider.id]?.success && modelFetchResults[provider.id]?.models.length > 0)) && (
                        <div>
                          <label htmlFor={`${provider.id}-test-model`} className="block text-sm font-medium text-gray-700 mb-2">
                            测试连接使用的模型
                          </label>
                          <select
                            id={`${provider.id}-test-model`}
                            name={`${provider.id}-test-model`}
                            value={testModels[provider.id] || (provider.id === 'ollama' ? 'auto' : '')}
                            onChange={(e) => setTestModels(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          >
                            {provider.id === 'ollama' ? (
                              <option value="auto">🤖 自动选择（自动选择最小模型）</option>
                            ) : (
                              <option value="">选择测试模型（可选）</option>
                            )}
                            {(provider.id === 'ollama' && modelFetchResults[provider.id]?.success ? modelFetchResults[provider.id].models : provider.models).map((model, index) => {
                              const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                              const modelName = typeof model === 'string' ? convertModelIdToDisplayName(model) : model?.name || convertModelIdToDisplayName(model?.id || '') || `Model ${index + 1}`;
                              return (
                                <option key={`test-${provider.id}-${modelId}-${index}`} value={modelId}>
                                  {modelName}
                                </option>
                              );
                            })}
                          </select>
                          <p className="mt-1 text-xs text-gray-500">
                            此模型仅用于测试连接，不影响默认模型设置。如果不选择，将使用默认模型进行测试。
                          </p>
                        </div>
                      )}

                      {/* 模型可见性配置 */}
                      {(provider.models.length > 0 || (provider.id === 'ollama' && modelFetchResults[provider.id]?.success && modelFetchResults[provider.id]?.models.length > 0)) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            主页显示的模型
                          </label>
                          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                            <p className="text-xs text-gray-600 mb-3">
                              勾选的模型将在主页的模型选择器中显示，未勾选的模型将被隐藏
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                              {(() => {
                                // 优先显示动态获取的模型，如果没有则显示预设模型
                                let modelsToShow = provider.models;
                                
                                if (provider.id === 'ollama' && modelFetchResults[provider.id]?.success) {
                                  // Ollama特殊处理：使用获取的模型
                                  modelsToShow = modelFetchResults[provider.id].models;
                                } else if (config?.models && config.models.length > 0) {
                                  // 检查是否有动态获取的模型（对象格式）
                                  const hasDynamicModels = config.models.some((model: any) => 
                                    model && typeof model === 'object' && ('id' in model || 'name' in model)
                                  );
                                  
                                  if (hasDynamicModels) {
                                    // 如果有动态模型，只显示动态模型，完全替换默认模型
                                    modelsToShow = config.models.filter((model: any) => 
                                      model && typeof model === 'object' && ('id' in model || 'name' in model)
                                    );
                                  } else {
                                    // 没有动态模型，使用所有配置的模型（包括默认模型）
                                    modelsToShow = config.models;
                                  }
                                }
                                
                                return modelsToShow;
                              })().map((model, index) => {
                                const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                                const modelName = typeof model === 'string' ? convertModelIdToDisplayName(model) : model?.name || convertModelIdToDisplayName(model?.id || '') || `Model ${index + 1}`;
                                
                                // 获取当前模型的可见性状态
                                const currentModels = config?.models || [];
                                let isVisible = true; // 默认可见
                                
                                // 检查是否已有配置
                                const existingModel = currentModels.find((m: any) => {
                                  if (typeof m === 'string') {
                                    return m === modelId;
                                  } else if (m && typeof m === 'object') {
                                    return m.id === modelId || m.name === modelId;
                                  }
                                  return false;
                                });
                                
                                if (existingModel && typeof existingModel === 'object' && 'visible' in existingModel) {
                                  isVisible = Boolean(existingModel.visible);
                                }
                                
                                return (
                                  <label key={`visibility-${provider.id}-${modelId}-${index}`} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                                    <input
                                      id={`model-${provider.id}-${modelId}-${index}`}
                                      name={`model-${provider.id}-${modelId}`}
                                      type="checkbox"
                                      checked={isVisible}
                                      onChange={(e) => {
                                        const newVisible = e.target.checked;
                                        
                                        // 更新模型配置，将模型转换为包含可见性的对象格式
                                        const updatedModels = (provider.id === 'ollama' && modelFetchResults[provider.id]?.success ? modelFetchResults[provider.id].models : provider.models).map((m, i) => {
                                          const mId = typeof m === 'string' ? m : m?.id || m?.name || `model-${i}`;
                                          const mName = typeof m === 'string' ? m : m?.name || m?.id || `Model ${i + 1}`;
                                          
                                          if (mId === modelId) {
                                            return {
                                              id: mId,
                                              name: mName,
                                              visible: newVisible
                                            };
                                          } else {
                                            // 保持其他模型的现有配置或默认为可见
                                            const existing = currentModels.find((cm: any) => {
                                              if (typeof cm === 'string') {
                                                return cm === mId;
                                              } else if (cm && typeof cm === 'object') {
                                                return cm.id === mId || cm.name === mId;
                                              }
                                              return false;
                                            });
                                            
                                            if (existing && typeof existing === 'object' && 'visible' in existing) {
                                              return {
                                                id: mId,
                                                name: mName,
                                                visible: existing.visible
                                              };
                                            } else {
                                              return {
                                                id: mId,
                                                name: mName,
                                                visible: true
                                              };
                                            }
                                          }
                                        });
                                        
                                        updateConfig(provider.id, 'models', updatedModels, true);
                                      }}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-700 truncate" title={modelName}>
                                      {modelName}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                              <span>
                                {(() => {
                                  // 使用与上面相同的逻辑确定要显示的模型
                                  let allModels = provider.models;
                                  
                                  if (provider.id === 'ollama' && modelFetchResults[provider.id]?.success) {
                                    allModels = modelFetchResults[provider.id].models;
                                  } else if (config?.models && config.models.length > 0) {
                                    const hasDynamicModels = config.models.some((model: any) => 
                                      model && typeof model === 'object' && ('id' in model || 'name' in model)
                                    );
                                    
                                    if (hasDynamicModels) {
                                      // 如果有动态模型，只使用动态模型
                                      allModels = config.models.filter((model: any) => 
                                        model && typeof model === 'object' && ('id' in model || 'name' in model)
                                      );
                                    } else {
                                      // 没有动态模型，使用所有配置的模型
                                      allModels = config.models;
                                    }
                                  }
                                  
                                  const currentModels = config?.models || [];
                                  const visibleCount = allModels.filter((model, index) => {
                                    const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                                    const existingModel = currentModels.find((m: any) => {
                                      if (typeof m === 'string') {
                                        return m === modelId;
                                      } else if (m && typeof m === 'object') {
                                        return m.id === modelId || m.name === modelId;
                                      }
                                      return false;
                                    });
                                    
                                    if (existingModel && typeof existingModel === 'object' && 'visible' in existingModel) {
                                      return existingModel.visible;
                                    }
                                    return true; // 默认可见
                                  }).length;
                                  return `已选择 ${visibleCount}/${allModels.length} 个模型`;
                                })()}
                              </span>
                              <div className="flex space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // 全选 - 使用与显示相同的逻辑
                                    let allModels = provider.models;
                                    
                                    if (provider.id === 'ollama' && modelFetchResults[provider.id]?.success) {
                                      allModels = modelFetchResults[provider.id].models;
                                    } else if (config?.models && config.models.length > 0) {
                                      const hasDynamicModels = config.models.some((model: any) => 
                                        model && typeof model === 'object' && ('id' in model || 'name' in model)
                                      );
                                      
                                      if (hasDynamicModels) {
                                        // 如果有动态模型，只使用动态模型
                                        allModels = config.models.filter((model: any) => 
                                          model && typeof model === 'object' && ('id' in model || 'name' in model)
                                        );
                                      } else {
                                        // 没有动态模型，使用所有配置的模型
                                        allModels = config.models;
                                      }
                                    }
                                    
                                    const updatedModels = allModels.map((model, index) => {
                                      const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                                      const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Model ${index + 1}`;
                                      return {
                                        id: modelId,
                                        name: modelName,
                                        visible: true
                                      };
                                    });
                                    updateConfig(provider.id, 'models', updatedModels);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 underline"
                                >
                                  全选
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // 全不选 - 使用与显示相同的逻辑
                                    let allModels = provider.models;
                                    
                                    if (provider.id === 'ollama' && modelFetchResults[provider.id]?.success) {
                                      allModels = modelFetchResults[provider.id].models;
                                    } else if (config?.models && config.models.length > 0) {
                                      const hasDynamicModels = config.models.some((model: any) => 
                                        model && typeof model === 'object' && ('id' in model || 'name' in model)
                                      );
                                      
                                      if (hasDynamicModels) {
                                        // 如果有动态模型，只使用动态模型
                                        allModels = config.models.filter((model: any) => 
                                          model && typeof model === 'object' && ('id' in model || 'name' in model)
                                        );
                                      } else {
                                        // 没有动态模型，使用所有配置的模型
                                        allModels = config.models;
                                      }
                                    }
                                    
                                    const updatedModels = allModels.map((model, index) => {
                                      const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
                                      const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Model ${index + 1}`;
                                      return {
                                        id: modelId,
                                        name: modelName,
                                        visible: false
                                      };
                                    });
                                    updateConfig(provider.id, 'models', updatedModels);
                                  }}
                                  className="text-gray-600 hover:text-gray-800 underline"
                                >
                                  全不选
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Deep Research 模型列表（独立区域） */}
                      {provider.id === 'openai' && modelFetchResults[provider.id]?.success && 
                       modelFetchResults[provider.id]?.researchModels && 
                       modelFetchResults[provider.id].researchModels!.length > 0 && (
                        <div className="mt-6">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            🔬 Deep Research 模型
                          </label>
                          <div className="bg-gray-50 border border-gray-300 rounded-md p-4">
                            <p className="text-xs text-gray-500 mb-3">
                              ⚠️ 暂不支持此功能
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto opacity-50">
                              {modelFetchResults[provider.id].researchModels!.map((model, index) => {
                                const modelId = typeof model === 'string' ? model : model?.id || model?.name || `research-model-${index}`;
                                const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Research Model ${index + 1}`;
                                
                                return (
                                  <label key={`research-visibility-${provider.id}-${modelId}-${index}`} className="flex items-center space-x-2 p-2 rounded cursor-not-allowed">
                                    <input
                                      id={`research-model-${provider.id}-${modelId}-${index}`}
                                      name={`research-model-${provider.id}-${modelId}`}
                                      type="checkbox"
                                      checked={false}
                                      disabled={true}
                                      onChange={() => {
                                        // 功能暂未适配，禁用操作
                                      }}
                                      className="h-4 w-4 text-gray-400 focus:ring-gray-300 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-400 truncate flex items-center" title={modelName}>
                                      🔍 {modelName}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                              <span>
                                功能开发中，敷请期待
                              </span>
                              <div className="flex space-x-2">
                                <button
                                  type="button"
                                  disabled
                                  className="text-gray-300 cursor-not-allowed"
                                >
                                  全选
                                </button>
                                <button
                                  type="button"
                                  disabled
                                  className="text-gray-300 cursor-not-allowed"
                                >
                                  全不选
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 测试结果 */}
                      {testResult && (
                        <div className={`p-3 rounded-md ${
                          testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center">
                            {testResult.success ? (
                              <Check className="w-4 h-4 text-green-500 mr-2" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
                            )}
                            <span className={`text-sm ${
                              testResult.success ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {testResult.message}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Responses API 特定测试结果 */}
                      {testResults[`${provider.id}-responses`] && (
                        <div className={`p-3 rounded-md border ${
                          testResults[`${provider.id}-responses`].success 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-center">
                            {testResults[`${provider.id}-responses`].success ? (
                              <Check className="w-4 h-4 text-green-500 mr-2" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
                            )}
                            <span className={`text-sm ${
                              testResults[`${provider.id}-responses`].success ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {testResults[`${provider.id}-responses`].message}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 模型获取结果 */}
                      {modelFetchResults[provider.id] && (
                        <div className={`p-3 rounded-md ${
                          modelFetchResults[provider.id].success ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center mb-2">
                            {modelFetchResults[provider.id].success ? (
                              <Check className="w-4 h-4 text-blue-500 mr-2" />
                            ) : (
                              <X className="w-4 h-4 text-red-500 mr-2" />
                            )}
                            <span className={`text-sm ${
                              modelFetchResults[provider.id].success ? 'text-blue-700' : 'text-red-700'
                            }`}>
                              {modelFetchResults[provider.id].message}
                            </span>
                          </div>
                          {modelFetchResults[provider.id].success && modelFetchResults[provider.id].models.length > 0 && (
                            <div className="mt-2">
                              <div className="text-sm text-blue-700 mb-1">可用模型：</div>
                              <div className="flex flex-wrap gap-1">
                                {modelFetchResults[provider.id].models.slice(0, 10).map((model, index) => {
                                  const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Model ${index + 1}`;
                                  return (
                                    <span key={`${provider.id}-result-${index}`} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                      {modelName}
                                    </span>
                                  );
                                })}
                                {modelFetchResults[provider.id].models.length > 10 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                    +{modelFetchResults[provider.id].models.length - 10} 更多
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {/* Deep Research 模型显示（仅对 OpenAI 显示，低调样式） */}
                          {(() => {
                            const shouldShow = provider.id === 'openai' && 
                                              modelFetchResults[provider.id]?.success && 
                                              modelFetchResults[provider.id]?.researchModels && 
                                              modelFetchResults[provider.id].researchModels!.length > 0;
                            
                            return shouldShow;
                          })() && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <div className="text-xs text-gray-500 mb-1">
                                + {modelFetchResults[provider.id].researchModels!.length} 个研究专用模型
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {modelFetchResults[provider.id].researchModels!.slice(0, 3).map((model, index) => {
                                  const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Research Model ${index + 1}`;
                                  return (
                                    <span key={`${provider.id}-research-${index}`} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                      {modelName}
                                    </span>
                                  );
                                })}
                                {modelFetchResults[provider.id].researchModels!.length > 3 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">
                                    +{modelFetchResults[provider.id].researchModels!.length - 3} 更多
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 保存状态显示和操作按钮 */}
                      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <div className="flex items-center space-x-3">
                          {saveStatus[provider.id]?.status === 'success' && (
                            <div className="inline-flex items-center px-3 py-1 rounded-md text-sm text-green-700 bg-green-100">
                              <Check className="w-4 h-4 mr-2" />
                              {saveStatus[provider.id]?.message}
                            </div>
                          )}
                          {saveStatus[provider.id]?.status === 'error' && (
                            <div className="inline-flex items-center px-3 py-1 rounded-md text-sm text-red-700 bg-red-100">
                              <X className="w-4 h-4 mr-2" />
                              {saveStatus[provider.id]?.message}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => manualSaveConfig(provider.id)}
                            disabled={manualSaving[provider.id] || !config}
                            className="inline-flex items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {manualSaving[provider.id] ? '保存中...' : '手动保存'}
                          </button>
                          <button
                            onClick={() => testConnection(provider.id)}
                            disabled={testingProvider === provider.id || !config}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Zap className="w-4 h-4 mr-2" />
                            {testingProvider === provider.id ? t('settings.testing') : t('settings.testConnection')}
                          </button>
                          <button
                            onClick={() => fetchModels(provider.id)}
                            disabled={(fetchingModels && fetchingModels[provider.id]) || !config}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            {(fetchingModels && fetchingModels[provider.id]) ? t('settings.fetching') : t('settings.fetchModelList')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 用户管理面板 */}
            {activeTab === 'user-management' && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <User className="w-6 h-6 text-indigo-600 mr-3" />
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">{t('settings.userManagement')}</h2>
                      <p className="mt-1 text-sm text-gray-500">{t('settings.userManagementDescription')}</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6">
                  {!user ? (
                    <div className="text-center py-8 text-gray-500">
                      <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>{t('settings.pleaseLoginFirst')}</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* 个人信息区域 */}
                      <div>
                        <h3 className="text-md font-medium text-gray-900 mb-4">{t('settings.personalInfo')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                              {t('settings.username')}
                            </label>
                            <input
                              id="username"
                              name="username"
                              type="text"
                              value={user.username}
                              disabled
                              className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-500"
                            />
                            <p className="mt-1 text-gray-500 text-sm">{t('settings.usernameCannotModify')}</p>
                          </div>

                          <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                              {t('settings.email')}
                            </label>
                            <input
                              id="email"
                              name="email"
                              type="email"
                              value={user.email || ''}
                              disabled
                              className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-500"
                            />
                          </div>

                          <div>
                            <label htmlFor="registrationTime" className="block text-sm font-medium text-gray-700 mb-1">
                              {t('settings.registrationTime')}
                            </label>
                            <input
                              id="registrationTime"
                              name="registrationTime"
                              type="text"
                              value={new Date(user.created_at).toLocaleString()}
                              disabled
                              className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 密码修改区域 */}
                      <div className="border-t border-gray-200 pt-8">
                        <div className="flex items-center mb-4">
                          <Lock className="w-5 h-5 text-indigo-600 mr-2" />
                          <h3 className="text-md font-medium text-gray-900">{t('settings.changePassword')}</h3>
                        </div>
                        
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                          {/* 成功/错误消息 */}
                          {passwordSuccess && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                              {passwordSuccess}
                            </div>
                          )}
                          
                          {passwordError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                              {passwordError}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* 当前密码 */}
                            <div className="md:col-span-2">
                              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                {t('settings.currentPassword')} *
                              </label>
                              <div className="relative">
                                <input
                                  id="currentPassword"
                                  name="currentPassword"
                                  type={showUserPasswords ? "text" : "password"}
                                  value={currentPassword}
                                  onChange={(e) => setCurrentPassword(e.target.value)}
                                  placeholder={t('settings.enterCurrentPassword')}
                                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowUserPasswords(!showUserPasswords)}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                  disabled={authLoading}
                                >
                                  {showUserPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* 新密码 */}
                            <div>
                              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                {t('settings.newPassword')} *
                              </label>
                              <input
                                id="newPassword"
                                name="newPassword"
                                type={showUserPasswords ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder={t('settings.setNewPassword')}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                required
                              />
                            </div>

                            {/* 确认新密码 */}
                            <div>
                              <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                {t('settings.confirmNewPassword')} *
                              </label>
                              <input
                                id="confirmNewPassword"
                                name="confirmNewPassword"
                                type={showUserPasswords ? "text" : "password"}
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                placeholder={t('settings.confirmNewPassword')}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                required
                              />
                            </div>
                          </div>

                          {/* 密码强度指示器 */}
                          {newPassword && (
                            <PasswordStrength 
                              password={newPassword} 
                              onValidation={(isValid, errors, strength) => {
                                setPasswordValidation({ isValid, errors, strength });
                              }}
                            />
                          )}

                          {/* 提交按钮 */}
                          <div className="pt-4">
                            <button
                              type="submit"
                              disabled={authLoading || !currentPassword || !newPassword || !confirmNewPassword}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Save className="w-4 h-4" />
                              {authLoading ? t('settings.changing') : t('settings.changePasswordButton')}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 语言设置面板 */}
            {activeTab === 'language-settings' && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <Globe className="w-6 h-6 text-green-600 mr-3" />
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">{t('settings.languageSettings')}</h2>
                      <p className="mt-1 text-sm text-gray-500">{t('settings.selectLanguage')}</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        {t('common.language')}
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          onClick={async () => {
                            await i18n.changeLanguage('zh');
                            // 强制重新加载提供商数据以应用新语言
                            loadConfigs();
                          }}
                          className={`p-4 border-2 rounded-lg text-left transition-all duration-200 ${
                            i18n.language === 'zh'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium">{t('common.chinese')}</h3>
                              <p className="text-sm text-gray-500 mt-1">简体中文</p>
                            </div>
                            {i18n.language === 'zh' && (
                              <Check className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                        </button>
                        
                        <button
                          onClick={async () => {
                            await i18n.changeLanguage('en');
                            // 强制重新加载提供商数据以应用新语言
                            loadConfigs();
                          }}
                          className={`p-4 border-2 rounded-lg text-left transition-all duration-200 ${
                            i18n.language === 'en'
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium">{t('common.english')}</h3>
                              <p className="text-sm text-gray-500 mt-1">English</p>
                            </div>
                            {i18n.language === 'en' && (
                              <Check className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600">
                        <p className="mb-2">
                          <strong>{t('common.language')}:</strong> {i18n.language === 'zh' ? '中文' : 'English'}
                        </p>
                        <p className="text-xs text-gray-500 mb-3">
                          {t('settings.languageNote')}
                        </p>
                        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs text-amber-700">
                            {t('settings.refreshAfterLanguageChange')}
                          </p>
                          <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center px-3 py-1 border border-amber-300 text-xs font-medium rounded text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            {t('settings.refreshPage')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* 缓存管理面板 */}
            {activeTab === 'cache-management' && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-orange-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">缓存管理</h2>
                      <p className="mt-1 text-sm text-gray-500">管理应用缓存和本地存储数据</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6">
                  <div className="space-y-6">
                    {/* 警告提示 */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-yellow-800">注意</h4>
                          <p className="text-sm text-yellow-700 mt-1">
                            清除缓存将删除本地存储的数据，请谨慎操作。如需完全清除所有数据，请先退出登录再在登录页面进行清理。
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 缓存操作按钮 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 普通清除缓存 */}
                      <div className="border border-gray-200 rounded-lg p-6 relative group">
                        <div className="flex items-center mb-4">
                          <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <h4 className="font-medium text-gray-900">普通清理缓存</h4>
                          <div className="ml-auto relative">
                            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {/* Tooltip */}
                            <div className="absolute right-0 top-6 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-300 pointer-events-none z-10">
                              <div className="mb-2">
                                <strong>清理内容：</strong><br />
                                • 设置页面标签状态<br />
                                • 临时缓存数据<br />
                                • 调试和开发数据<br />
                                • 过期时间戳数据
                              </div>
                              <div>
                                <strong>保留内容：</strong><br />
                                • 对话历史<br />
                                • 模型选择<br />
                                • AI参数<br />
                                • 登录状态<br />
                                • 语言设置
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                          清理临时数据和界面状态，不影响对话历史、模型选择等重要配置。
                        </p>
                        <button
                          onClick={handleClearCache}
                          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                        >
                          清理垃圾缓存
                        </button>
                      </div>

                      {/* 深度清除缓存 */}
                      <div className="border border-red-200 rounded-lg p-6 relative group">
                        <div className="flex items-center mb-4">
                          <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <h4 className="font-medium text-gray-900">深度清除缓存</h4>
                          <div className="ml-auto relative">
                            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {/* Tooltip */}
                            <div className="absolute right-0 top-6 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-300 pointer-events-none z-10">
                              <div className="mb-2">
                                <strong>清理内容：</strong><br />
                                • 对话历史<br />
                                • 模型选择<br />
                                • AI参数<br />
                                • 主题设置<br />
                                • 设置页面标签状态<br />
                                • 所有临时和缓存数据
                              </div>
                              <div className="mb-2">
                                <strong>保留内容：</strong><br />
                                • 登录状态<br />
                                • 语言设置
                              </div>
                              <div className="text-yellow-300">
                                <strong>⚠️ 注意：</strong><br />
                                几乎所有内容都需要重新配置
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                          清除对话历史、模型选择、AI参数等所有用户数据，保留登录状态和语言设置。
                        </p>
                        <button
                          onClick={handleClearAllCache}
                          className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                        >
                          深度清除缓存
                        </button>
                      </div>
                    </div>

                    {/* 缓存信息显示 */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h4 className="font-medium text-gray-900 mb-4">当前缓存状态</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">对话历史:</span>
                            <span className={localStorage.getItem('conversations') ? 'text-green-600' : 'text-gray-400'}>
                              {localStorage.getItem('conversations') ? '已存储' : '无数据'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">模型选择:</span>
                            <span className={localStorage.getItem('selectedModel') ? 'text-green-600' : 'text-gray-400'}>
                              {localStorage.getItem('selectedModel') ? '已存储' : '无数据'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">AI参数:</span>
                            <span className={localStorage.getItem('ai-parameters') ? 'text-green-600' : 'text-gray-400'}>
                              {localStorage.getItem('ai-parameters') ? '已存储' : '无数据'}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">设置标签:</span>
                            <span className={localStorage.getItem('settings-active-tab') ? 'text-green-600' : 'text-gray-400'}>
                              {localStorage.getItem('settings-active-tab') ? '已存储' : '无数据'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">语言设置:</span>
                            <span className={localStorage.getItem('i18nextLng') ? 'text-blue-600' : 'text-gray-400'}>
                              {localStorage.getItem('i18nextLng') ? `${localStorage.getItem('i18nextLng') === 'zh' ? '中文' : 'English'}` : '默认'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">登录状态:</span>
                            <span className={localStorage.getItem('auth-storage') ? 'text-green-600' : 'text-gray-400'}>
                              {localStorage.getItem('auth-storage') ? '已登录' : '未登录'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}