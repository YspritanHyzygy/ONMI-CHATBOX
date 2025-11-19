import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check, ChevronRight, ArrowLeft } from 'lucide-react';
import { getUserId } from '../lib/user';
import { getValidatedModel, setStorageItem } from '../lib/storage';

interface ModelOption {
  provider: string;
  providerName: string;
  model: string;
  displayName: string;
}

interface ModelSelectorProps {
  selectedModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  className?: string;
}

interface GroupedModels {
  [providerName: string]: ModelOption[];
}

interface ProviderInfo {
  id: string;
  name: string;
  modelCount: number;
}

// 获取厂商显示名称 - 动态从API数据获取，不再硬编码
const getProviderDisplayName = (providerId: string, providerName?: string): string => {
  // 优先使用API返回的显示名称
  if (providerName) {
    return providerName;
  }
  
  // 作为fallback，将ID转换为友好的显示名称
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};

export default function ModelSelector({ selectedModel, onModelChange, className = '' }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [groupedModels, setGroupedModels] = useState<GroupedModels>({});
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersData, setProvidersData] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const isFetchingModels = useRef(false);

  const fetchModels = useCallback(async () => {
    // Prevent concurrent fetches
    if (isFetchingModels.current) {
      console.log('[ModelSelector] Fetch already in progress, skipping');
      return;
    }

    isFetchingModels.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const userId = getUserId();
      const response = await fetch(`/api/providers?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) {
        throw new Error('无法获取模型列表，请检查后端服务是否正常运行。');
      }
      const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
          // 保存API数据供后续使用
          setProvidersData(result.data);
          
          const models: ModelOption[] = [];
          const grouped: GroupedModels = {};
          let defaultModelFromSettings: ModelOption | null = null;
          
          // 使用Set来跟踪已添加的模型，避免重复
          const addedModels = new Set<string>();

          result.data.forEach((provider: any) => {
            // 只有已配置的提供商才会被包含在result.data中
            if (provider && Array.isArray(provider.models)) {
              const providerId = provider.id || provider.provider_name;
              const providerDisplayName = getProviderDisplayName(providerId, provider.name || provider.displayName);
              
              // 获取该提供商的配置，包括默认模型
              const providerConfig = provider.config || {};
              const defaultModel = providerConfig.model;
              
              provider.models.forEach((model: string | { id?: string; name?: string; [key: string]: unknown }) => {
                // 统一处理模型数据，支持字符串和对象两种格式
                let modelId: string;
                let modelDisplayName: string;
                
                if (typeof model === 'string') {
                  modelId = model;
                  modelDisplayName = model;
                } else if (model && typeof model === 'object') {
                  modelId = model.id || model.name || String(model);
                  modelDisplayName = model.name || model.id || String(model);
                  
                  // 检查模型是否在聊天中可见
                  if (model.visibleInChat === false) {
                    console.log(`隐藏非聊天模型: ${modelId} (类型: ${model.type || 'unknown'})`);
                    return; // 跳过非聊天模型
                  }
                } else {
                  console.warn('无效的模型数据格式:', model);
                  return;
                }
                
                // 生成唯一标识符来避免重复
                const uniqueKey = `${providerId}-${modelId}`;
                
                // 如果已经添加过这个模型，跳过
                if (addedModels.has(uniqueKey)) {
                  return;
                }
                
                const modelOption: ModelOption = {
                  provider: providerId,
                  providerName: providerDisplayName,
                  model: modelId,
                  displayName: modelDisplayName,
                };
                
                models.push(modelOption);
                addedModels.add(uniqueKey);
                
                // 按厂商分组
                if (!grouped[providerDisplayName]) {
                  grouped[providerDisplayName] = [];
                }
                grouped[providerDisplayName].push(modelOption);
                
                // 如果这是设置页面配置的默认模型，记录下来
                if (modelId === defaultModel && !defaultModelFromSettings) {
                  defaultModelFromSettings = modelOption;
                }
              });
            }
          });
          
          setAvailableModels(models);
          
          // 生成厂商列表并对模型进行排序
          const providerList: ProviderInfo[] = Object.entries(grouped).map(([providerDisplayName, models]) => {
            // 对每个厂商的模型进行排序，默认模型排在第一位
            const providerData = result.data.find((p: any) => {
              const pDisplayName = getProviderDisplayName(p.id || p.provider_name, p.name || p.displayName);
              return pDisplayName === providerDisplayName;
            });
            const providerConfig = providerData?.config || {};
            const defaultModelId = providerConfig.model;
            
            if (defaultModelId) {
              // 找到默认模型并排序
              const defaultModelIndex = models.findIndex(model => model.model === defaultModelId);
              if (defaultModelIndex > 0) {
                // 将默认模型移到第一位
                const defaultModel = models[defaultModelIndex];
                models.splice(defaultModelIndex, 1);
                models.unshift(defaultModel);
                console.log(`[ModelSelector] 将默认模型 ${defaultModelId} 排到 ${providerDisplayName} 的首位`);
              }
            }
            
            return {
              id: models[0]?.provider || providerDisplayName.toLowerCase(),
              name: providerDisplayName,
              modelCount: models.length
            };
          });
          
          setGroupedModels(grouped);
          setProviders(providerList);

          // 优先使用localStorage中保存的模型，其次是设置页面的默认模型，最后是第一个可用模型
          let modelToSelect: ModelOption | null = null;
          
          // 1. 首先尝试从localStorage读取（使用验证工具）
          const savedModelResult = getValidatedModel('selectedModel');
          if (savedModelResult.success && savedModelResult.data) {
            const matchedModel = models.find(m => 
              m.model === savedModelResult.data.model && 
              m.provider === savedModelResult.data.provider
            );
            if (matchedModel) {
              modelToSelect = matchedModel;
              console.log('[ModelSelector] Using saved model from localStorage:', modelToSelect);
            } else {
              console.warn('[ModelSelector] Saved model not found in available models');
            }
          } else if (savedModelResult.error) {
            console.warn('[ModelSelector] Error loading saved model:', savedModelResult.error);
          }
          
          // 2. 如果localStorage中没有有效模型，使用设置页面的默认模型
          if (!modelToSelect && defaultModelFromSettings) {
            modelToSelect = defaultModelFromSettings;
            console.log('[ModelSelector] Using default model from settings:', modelToSelect);
          }
          
          // 3. 如果都没有，使用第一个可用模型
          if (!modelToSelect && models.length > 0) {
            modelToSelect = models[0];
            console.log('[ModelSelector] Using first available model:', modelToSelect);
          }
          
          // 4. 设置选中的模型（只在初始化时）
          if (modelToSelect && isInitialMount.current) {
            // 只在第一次加载时设置默认模型
            if (!selectedModel || 
                selectedModel.model !== modelToSelect.model || 
                selectedModel.provider !== modelToSelect.provider) {
              // Use queueMicrotask to avoid state updates during render
              queueMicrotask(() => {
                onModelChange(modelToSelect);
              });
            }
            isInitialMount.current = false;
          }
        } else {
          // 如果没有任何配置的厂商，显示提示信息
          setAvailableModels([]);
          setGroupedModels({});
          setProviders([]);
          setError('请先在设置页面配置AI服务提供商');
        }
      } catch (e: any) {
        setError(e.message || '加载模型失败。');
        console.error('[ModelSelector] Error fetching models:', e);
      } finally {
        setLoading(false);
        isFetchingModels.current = false;
      }
  }, [onModelChange, selectedModel]);

  useEffect(() => {
    fetchModels();
    
    // 监听模型列表更新事件
    const handleModelsUpdated = () => {
      console.log('Models updated, refetching...');
      fetchModels();
    };
    
    window.addEventListener('modelsUpdated', handleModelsUpdated);
    
    return () => {
      window.removeEventListener('modelsUpdated', handleModelsUpdated);
    };
  }, []);  // 移除不必要的依赖项

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedProvider(null); // 重置厂商选择
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 监听localStorage变化，当设置页面保存配置时同步更新
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      // Check if the changed key is selectedModel
      let changedKey: string | null = null;
      
      if (e instanceof StorageEvent) {
        changedKey = e.key;
      } else if ('detail' in e && e.detail) {
        changedKey = e.detail.key;
      }
      
      if (changedKey !== 'selectedModel') {
        return;
      }
      
      // Use validated getter
      const savedModelResult = getValidatedModel('selectedModel');
      
      if (savedModelResult.success && savedModelResult.data && availableModels.length > 0) {
        const matchedModel = availableModels.find(m => 
          m.model === savedModelResult.data.model && 
          m.provider === savedModelResult.data.provider
        );
        
        if (matchedModel && (!selectedModel || 
            selectedModel.model !== matchedModel.model || 
            selectedModel.provider !== matchedModel.provider)) {
          // Use queueMicrotask to avoid state updates during render
          queueMicrotask(() => {
            onModelChange(matchedModel);
          });
        }
      } else if (savedModelResult.error) {
        console.warn('[ModelSelector] Error syncing model from storage:', savedModelResult.error);
      }
    };

    // 只在有可用模型时才监听变化
    if (availableModels.length > 0) {
      // 监听storage事件（跨标签页）
      window.addEventListener('storage', handleStorageChange as EventListener);
      
      // 监听自定义事件（同一页面内）
      window.addEventListener('localStorageChanged', handleStorageChange as EventListener);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange as EventListener);
        window.removeEventListener('localStorageChanged', handleStorageChange as EventListener);
      };
    }
  }, [availableModels, selectedModel, onModelChange]);

  const handleModelSelect = (model: ModelOption) => {
    try {
      // Save to storage first with validation
      const saveResult = setStorageItem('selectedModel', model);
      
      if (!saveResult.success) {
        console.error('[ModelSelector] Failed to save model to storage:', saveResult.error);
        setError(saveResult.error || '保存模型失败');
        return;
      }
      
      // Update parent component state
      onModelChange(model);
      setIsOpen(false);
      setSelectedProvider(null); // 重置厂商选择
      setError(null); // Clear any previous errors
    } catch (error) {
      console.error('[ModelSelector] Error selecting model:', error);
      setError('选择模型失败，请重试');
    }
  };
  
  const handleProviderSelect = (providerId: string) => {
    console.log(`[ModelSelector] 选择厂商: ${providerId}`);
    console.log(`[ModelSelector] 可用的厂商显示名称:`, Object.keys(groupedModels));
    setSelectedProvider(providerId);
  };
  
  const handleBackToProviders = () => {
    setSelectedProvider(null);
  };

  if (loading) {
    return <div className={`text-sm text-gray-500 ${className}`}>加载模型中...</div>;
  }

  if (error || providers.length === 0) {
    return (
      <div className={`text-sm text-amber-600 ${className}`}>
        {error || '请先在设置页面配置AI服务提供商'}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={selectorRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-gray-900">
            {selectedModel ? (
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">{selectedModel.providerName}</span>
                <span>{selectedModel.displayName}</span>
              </div>
            ) : (
              '请选择模型'
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto custom-scrollbar min-w-full w-max">
          {selectedProvider ? (
            // 二级菜单：显示选中厂商的模型列表
            <div>
              <div className="flex items-center px-3 py-2 bg-gray-50 border-b border-gray-100">
                <button
                  onClick={handleBackToProviders}
                  className="flex items-center text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  返回厂商列表
                </button>
              </div>
              {(() => {
                // 根据selectedProvider ID查找对应的显示名称
                const providerData = providersData.find((p: any) => 
                  (p.id || p.provider_name) === selectedProvider
                );
                const displayName = providerData ? 
                  getProviderDisplayName(selectedProvider, providerData.name || providerData.displayName) : 
                  getProviderDisplayName(selectedProvider);
                
                const models = groupedModels[displayName] || [];
                console.log(`[ModelSelector] 显示厂商 ${displayName} 的模型，共 ${models.length} 个`);
                
                // 如果没有模型，显示提示信息
                if (models.length === 0) {
                  return (
                    <div className="p-4 text-center">
                      <div className="text-sm text-gray-500 mb-2">此厂商暂无可用模型</div>
                      <div className="text-xs text-gray-400">请先在设置页面获取模型列表</div>
                    </div>
                  );
                }
                
                return models.map((model, index) => (
                  <button
                    key={`${model.provider}-${model.model}-${index}`}
                    onClick={() => handleModelSelect(model)}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between transition-colors"
                  >
                    <span className="flex-1">{model.displayName}</span>
                    {selectedModel?.model === model.model && selectedModel?.provider === model.provider && (
                      <Check className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ));
              })()}
            </div>
          ) : (
            // 一级菜单：显示厂商列表
            <div>
              {providers.length > 0 ? (
                providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderSelect(provider.id)}
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{provider.name}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{provider.modelCount} 个模型</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">无可用厂商。</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
