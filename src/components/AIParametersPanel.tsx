import { useState, useEffect } from 'react';
import { Sliders, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ParameterHelp from './ParameterHelp';
import { getValidatedAIParameters, setStorageItem } from '../lib/storage';
// 移除错误的后端导入，改为通过API调用
// import { aiServiceManager } from '../../api/services/ai-service-manager.js';
// import type { AIProvider } from '../../api/services/types.js';

type AIProvider = 'openai' | 'claude' | 'gemini' | 'xai' | 'ollama';

interface AIParameters {
  temperature: number;
  maxTokens?: number;  // 可选参数，不设置时让模型自动判断输出长度
  topP: number;
  topK?: number;  // Top-K 采样
  frequencyPenalty?: number;  // 频率惩罚
  presencePenalty?: number;   // 存在惩罚
  repetitionPenalty?: number; // 重复惩罚（Ollama/Gemini）
  useResponsesAPI?: boolean;  // 是否使用 OpenAI Responses API
  // Research 模型工具配置
  researchTools?: {
    webSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
  };
  background?: boolean; // 是否使用后台模式（Research 模型推荐）
}

interface AIParametersPanelProps {
  onParametersChange: (params: AIParameters) => void;
  className?: string;
  selectedModel?: { provider?: string; model?: string } | null;  // 添加选中模型信息
}

// 兼容的限制接口（为了兼容现有代码）
interface LegacyProviderLimits {
  temperature: { min: number; max: number; recommended: number };
  maxTokens: { min: number; max: number; default: number };
  topP: { min: number; max: number; default: number };
  topK?: { min: number; max: number; default: number };
  frequencyPenalty?: { min: number; max: number; default: number };
  presencePenalty?: { min: number; max: number; default: number };
  repetitionPenalty?: { min: number; max: number; default: number };
}

// Fallback限制（当模型参数系统不可用时使用）
const FALLBACK_LIMITS: Record<string, LegacyProviderLimits> = {
  openai: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 4096, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    frequencyPenalty: { min: -2.0, max: 2.0, default: 0.0 },
    presencePenalty: { min: -2.0, max: 2.0, default: 0.0 },
  },
  claude: {
    temperature: { min: 0.0, max: 1.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 8192, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    topK: { min: 1, max: 500, default: 5 },
  },
  gemini: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 65536, default: 8192 },
    topP: { min: 0.0, max: 1.0, default: 0.95 },
    topK: { min: 1, max: 40, default: 20 },
  },
  xai: {
    temperature: { min: 0.0, max: 1.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 4096, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    frequencyPenalty: { min: -2.0, max: 2.0, default: 0.0 },
    presencePenalty: { min: -2.0, max: 2.0, default: 0.0 },
  },
  ollama: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 65536, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    topK: { min: 1, max: 100, default: 40 },
    repetitionPenalty: { min: 0.0, max: 2.0, default: 1.1 },
  }
};

const DEFAULT_PARAMS: AIParameters = {
  temperature: 0.7,
  maxTokens: undefined,  // 默认不限制，让模型自动判断
  topP: 1.0,
  topK: undefined,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  repetitionPenalty: undefined,
  useResponsesAPI: false,  // 默认不使用 Responses API
  researchTools: {
    webSearch: true,
    codeInterpreter: true,
    fileSearch: true
  },
  background: true
};

export default function AIParametersPanel({ onParametersChange, className = '', selectedModel }: AIParametersPanelProps) {
  const { t } = useTranslation();
  const [parameters, setParameters] = useState<AIParameters>(DEFAULT_PARAMS);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [currentLimits, setCurrentLimits] = useState<LegacyProviderLimits>(
    selectedModel?.provider ? FALLBACK_LIMITS[selectedModel.provider] || FALLBACK_LIMITS.openai : FALLBACK_LIMITS.openai
  );
  const [isExpanded, setIsExpanded] = useState(false); // 新增：控制面板展开状态

  // 判断是否为 Research 模型
  const isResearchModel = (model?: string): boolean => {
    if (!model) return false;
    const modelLower = model.toLowerCase();
    return modelLower.includes('research') || 
           modelLower.includes('o3-deep-research') || 
           modelLower.includes('o4-mini-deep-research');
  };

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isExpanded && !(event.target as Element).closest('.ai-parameters-panel')) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // 注入自定义滑块样式
  useEffect(() => {
    const sliderStyles = `
.slider::-webkit-slider-thumb {
  appearance: none;
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.slider::-moz-range-thumb {
  height: 16px;
  width: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.slider::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.slider::-webkit-slider-track {
  background: linear-gradient(90deg, #e5e7eb 0%, #3b82f6 50%, #8b5cf6 100%);
  height: 8px;
  border-radius: 4px;
}

.slider::-moz-range-track {
  background: linear-gradient(90deg, #e5e7eb 0%, #3b82f6 50%, #8b5cf6 100%);
  height: 8px;
  border-radius: 4px;
  border: none;
}
`;

    // 检查是否已经存在相同的样式
    const existingStyle = document.getElementById('slider-styles');
    if (!existingStyle) {
      const styleElement = document.createElement('style');
      styleElement.id = 'slider-styles';
      styleElement.textContent = sliderStyles;
      document.head.appendChild(styleElement);
    }
  }, []);

  // 加载模型参数限制 - 调用后端API
  const loadModelLimits = async (provider: AIProvider, modelId?: string) => {
    if (!provider) return;
    
    try {
      // 调用后端API获取模型参数限制
      const response = await fetch(`/api/model-limits/${provider}${modelId ? `/${modelId}` : ''}`);
      
      if (response.ok) {
        const modelEntry = await response.json();
        
        // 转换ModelParameterEntry为兼容格式
        const legacyLimits: LegacyProviderLimits = {
          temperature: {
            min: modelEntry.limits?.temperature?.min ?? 0,
            max: modelEntry.limits?.temperature?.max ?? 2,
            recommended: modelEntry.limits?.temperature?.default ?? 1
          },
          maxTokens: {
            min: modelEntry.limits?.maxTokens?.min ?? 1,
            max: modelEntry.limits?.maxTokens?.max ?? 4096,
            default: modelEntry.limits?.maxTokens?.default ?? 1024
          },
          topP: {
            min: modelEntry.limits?.topP?.min ?? 0,
            max: modelEntry.limits?.topP?.max ?? 1,
            default: modelEntry.limits?.topP?.default ?? 1
          },
          topK: modelEntry.limits?.topK ? {
            min: modelEntry.limits.topK.min ?? 1,
            max: modelEntry.limits.topK.max ?? 100,
            default: modelEntry.limits.topK.default ?? 40
          } : undefined,
          // 如果API没有返回这些参数，但fallback中有，则使用fallback值
          frequencyPenalty: modelEntry.limits?.frequencyPenalty ? {
            min: modelEntry.limits.frequencyPenalty.min ?? -2,
            max: modelEntry.limits.frequencyPenalty.max ?? 2,
            default: modelEntry.limits.frequencyPenalty.default ?? 0
          } : (FALLBACK_LIMITS[provider]?.frequencyPenalty || undefined),
          presencePenalty: modelEntry.limits?.presencePenalty ? {
            min: modelEntry.limits.presencePenalty.min ?? -2,
            max: modelEntry.limits.presencePenalty.max ?? 2,
            default: modelEntry.limits.presencePenalty.default ?? 0
          } : (FALLBACK_LIMITS[provider]?.presencePenalty || undefined),
          repetitionPenalty: modelEntry.limits?.repetitionPenalty ? {
            min: modelEntry.limits.repetitionPenalty.min ?? 0,
            max: modelEntry.limits.repetitionPenalty.max ?? 2,
            default: modelEntry.limits.repetitionPenalty.default ?? 1.1
          } : undefined
        };
        
        setCurrentLimits(legacyLimits);
        console.log(`[AIParametersPanel] 成功加载模型限制: ${provider}:${modelId}`, legacyLimits);
      } else {
        throw new Error(`API响应错误: ${response.status}`);
      }
    } catch (error) {
      console.warn(`[AIParametersPanel] 加载模型限制失败，使用fallback: ${provider}:${modelId}`, error);
      // 使用fallback限制
      const fallback = FALLBACK_LIMITS[provider] || FALLBACK_LIMITS.openai;
      setCurrentLimits(fallback);
    }
  };

  useEffect(() => {
    // 从本地存储加载参数（使用验证工具）
    const result = getValidatedAIParameters('ai-parameters');
    if (result.success && result.data) {
      // Data is already parsed by getValidatedAIParameters
      setParameters(result.data);
      validateParameters(result.data);
      onParametersChange(result.data);
    } else if (result.error) {
      console.error('Failed to load AI parameters:', result.error);
      onParametersChange(DEFAULT_PARAMS);
    } else {
      onParametersChange(DEFAULT_PARAMS);
    }
  }, [onParametersChange]);

  // 当模型变化时，加载新的参数限制
  useEffect(() => {
    if (selectedModel?.provider) {
      loadModelLimits(selectedModel.provider as AIProvider, selectedModel.model);
    }
  }, [selectedModel?.provider, selectedModel?.model]);
  
  // 当限制变化时，重新验证参数
  useEffect(() => {
    validateParameters(parameters);
  }, [currentLimits]);

  const validateParameters = (params: AIParameters) => {
    const errors: string[] = [];
    
    // 验证 temperature
    if (params.temperature < currentLimits.temperature.min || params.temperature > currentLimits.temperature.max) {
      errors.push(`${selectedModel?.provider || 'AI'} Temperature范围为 ${currentLimits.temperature.min}-${currentLimits.temperature.max}`);
    }
    
    // 验证 maxTokens
    if (params.maxTokens !== undefined && 
        (params.maxTokens < currentLimits.maxTokens.min || params.maxTokens > currentLimits.maxTokens.max)) {
      errors.push(`${selectedModel?.provider || 'AI'} 输出长度范围为 ${currentLimits.maxTokens.min}-${currentLimits.maxTokens.max.toLocaleString()}`);
    }
    
    // 验证 topP
    if (params.topP < currentLimits.topP.min || params.topP > currentLimits.topP.max) {
      errors.push(`${selectedModel?.provider || 'AI'} TopP范围为 ${currentLimits.topP.min}-${currentLimits.topP.max}`);
    }
    
    // Claude 特殊验证：不建议同时设置 temperature 和 topP
    if (selectedModel?.provider === 'claude' && 
        params.temperature !== currentLimits.temperature.recommended && 
        params.topP !== currentLimits.topP.default) {
      errors.push('Claude不建议同时调整Temperature和TopP，建议只修改其中一个');
    }
    
    setValidationErrors(errors);
  };

  const updateParameter = (key: keyof AIParameters, value: number | undefined | boolean | any) => {
    const newParams = { ...parameters, [key]: value };
    setParameters(newParams);
    validateParameters(newParams);
    onParametersChange(newParams);
    
    // Save with validation
    const result = setStorageItem('ai-parameters', newParams);
    if (!result.success) {
      console.error('Failed to save AI parameters:', result.error);
    }
  };

  // Research 模型工具更新方法
  const updateResearchTool = (toolName: keyof NonNullable<AIParameters['researchTools']>, enabled: boolean) => {
    const currentTools = parameters.researchTools || { webSearch: true, codeInterpreter: true, fileSearch: true };
    const newTools = {
      ...currentTools,
      [toolName]: enabled
    };
    updateParameter('researchTools', newTools);
  };

  const resetToDefaults = () => {
    // 根据当前厂商设置推荐默认值
    const providerDefaults: AIParameters = {
      temperature: currentLimits.temperature.recommended,
      maxTokens: undefined, // 保持不限制策略
      topP: currentLimits.topP.default,
      topK: currentLimits.topK?.default,
      frequencyPenalty: currentLimits.frequencyPenalty?.default || 0,
      presencePenalty: currentLimits.presencePenalty?.default || 0,
      repetitionPenalty: currentLimits.repetitionPenalty?.default,
      useResponsesAPI: false,
      researchTools: {
        webSearch: true,
        codeInterpreter: true,
        fileSearch: true
      },
      background: isResearchModel(selectedModel?.model)
    };
    
    setParameters(providerDefaults);
    validateParameters(providerDefaults);
    onParametersChange(providerDefaults);
    
    // Save with validation
    const result = setStorageItem('ai-parameters', providerDefaults);
    if (!result.success) {
      console.error('Failed to save AI parameters:', result.error);
    }
  };

  return (
    <div className={`relative ${className} ai-parameters-panel`}>
      {/* 参数设置按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          validationErrors.length > 0
            ? 'text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-300'
            : 'text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300'
        }`}
        title={t('parameters.title')}
      >
        <Sliders className="w-4 h-4" />
        <span>参数</span>
        {validationErrors.length > 0 && (
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
        )}
      </button>

      {/* 参数面板弹出层 */}
      {isExpanded && (
        <div className="absolute top-full right-0 sm:right-0 left-0 sm:left-auto mt-2 w-full sm:w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{t('parameters.title')}</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          {/* 验证错误提示 */}
          {validationErrors.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-orange-700">
                  <p className="font-medium mb-1">{t('parameters.parametersOutOfRange')}</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={resetToDefaults}
                className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors mt-2"
                title={t('parameters.resetToDefault')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('parameters.reset')}</span>
              </button>
            </div>
          )}
          <div className="space-y-4">
            {/* Temperature 滑块 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">{t('parameters.creativity')}</label>
                  <ParameterHelp parameter="temperature" provider={selectedModel?.provider} />
                </div>
                <span className={`text-sm px-2 py-1 rounded ${
                  parameters.temperature < currentLimits.temperature.min || parameters.temperature > currentLimits.temperature.max
                    ? 'text-orange-700 bg-orange-100'
                    : 'text-gray-500 bg-gray-100'
                }`}>
                  {parameters.temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={currentLimits.temperature.min}
                max={currentLimits.temperature.max}
                step="0.1"
                value={Math.max(currentLimits.temperature.min, Math.min(currentLimits.temperature.max, parameters.temperature))}
                onChange={(e) => updateParameter('temperature', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{t('parameters.conservative')} ({currentLimits.temperature.min})</span>
                <span>{t('parameters.innovative')} ({currentLimits.temperature.max})</span>
              </div>
            </div>

            {/* Max Tokens 控制 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">{t('parameters.outputLengthLimit')}</label>
                  <ParameterHelp parameter="maxTokens" provider={selectedModel?.provider} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${
                    parameters.maxTokens !== undefined && 
                    (parameters.maxTokens < currentLimits.maxTokens.min || parameters.maxTokens > currentLimits.maxTokens.max)
                      ? 'text-orange-600'
                      : 'text-gray-500'
                  }`}>
                    {parameters.maxTokens === undefined 
                      ? t('parameters.noLengthLimit') 
                      : t('parameters.maxTokens', { count: parameters.maxTokens })
                    }
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parameters.maxTokens === undefined}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateParameter('maxTokens', undefined);
                        } else {
                          updateParameter('maxTokens', currentLimits.maxTokens.default);
                        }
                      }}
                      className="sr-only"
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors duration-200 relative ${
                      parameters.maxTokens === undefined ? 'bg-blue-600' : 'bg-gray-200'
                    }`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                        parameters.maxTokens === undefined ? 'translate-x-4' : 'translate-x-0.5'
                      }`}></div>
                    </div>
                  </label>
                </div>
              </div>
              
              {/* Max Tokens 滑块 - 只在未选中“无限制”时显示 */}
              {parameters.maxTokens !== undefined && (
                <>
                  <input
                    type="range"
                    min={currentLimits.maxTokens.min}
                    max={currentLimits.maxTokens.max}
                    step="1"
                    value={parameters.maxTokens || currentLimits.maxTokens.default}
                    onChange={(e) => updateParameter('maxTokens', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>简短 ({currentLimits.maxTokens.min})</span>
                    <span>详细 ({currentLimits.maxTokens.max})</span>
                  </div>
                </>
              )}
            </div>

            {/* Top-P 滑块 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">{t('parameters.diversity')}</label>
                  <ParameterHelp parameter="topP" provider={selectedModel?.provider} />
                </div>
                <span className={`text-sm px-2 py-1 rounded ${
                  parameters.topP < currentLimits.topP.min || parameters.topP > currentLimits.topP.max
                    ? 'text-orange-700 bg-orange-100'
                    : 'text-gray-500 bg-gray-100'
                }`}>
                  {parameters.topP.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={currentLimits.topP.min}
                max={currentLimits.topP.max}
                step="0.1"
                value={Math.max(currentLimits.topP.min, Math.min(currentLimits.topP.max, parameters.topP))}
                onChange={(e) => updateParameter('topP', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{t('parameters.focused')} ({currentLimits.topP.min})</span>
                <span>{t('parameters.diverse')} ({currentLimits.topP.max})</span>
              </div>
            </div>

            {/* Top K 控制 (Gemini, Claude, Ollama) - 排除 OpenAI 和 xAI */}
            {currentLimits.topK && selectedModel?.provider !== 'openai' && selectedModel?.provider !== 'xai' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">词汇丰富度 (Top-K)</label>
                    <ParameterHelp parameter="topK" provider={selectedModel?.provider} />
                  </div>
                  <span className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-500">
                    {parameters.topK || currentLimits.topK.default}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentLimits.topK.min}
                  max={currentLimits.topK.max}
                  step="1"
                  value={parameters.topK || currentLimits.topK.default}
                  onChange={(e) => updateParameter('topK', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>集中 ({currentLimits.topK.min})</span>
                  <span>多样 ({currentLimits.topK.max})</span>
                </div>
              </div>
            )}

            {/* Frequency Penalty (OpenAI, xAI) */}
            {currentLimits.frequencyPenalty && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">频率惩罚</label>
                    <ParameterHelp parameter="frequencyPenalty" provider={selectedModel?.provider} />
                  </div>
                  <span className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-500">
                    {(parameters.frequencyPenalty || 0).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentLimits.frequencyPenalty.min}
                  max={currentLimits.frequencyPenalty.max}
                  step="0.1"
                  value={parameters.frequencyPenalty || 0}
                  onChange={(e) => updateParameter('frequencyPenalty', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>允许重复 ({currentLimits.frequencyPenalty.min})</span>
                  <span>避免重复 ({currentLimits.frequencyPenalty.max})</span>
                </div>
              </div>
            )}

            {/* Presence Penalty (OpenAI, xAI) */}
            {currentLimits.presencePenalty && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">存在惩罚</label>
                    <ParameterHelp parameter="presencePenalty" provider={selectedModel?.provider} />
                  </div>
                  <span className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-500">
                    {(parameters.presencePenalty || 0).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentLimits.presencePenalty.min}
                  max={currentLimits.presencePenalty.max}
                  step="0.1"
                  value={parameters.presencePenalty || 0}
                  onChange={(e) => updateParameter('presencePenalty', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>深入主题 ({currentLimits.presencePenalty.min})</span>
                  <span>探索新话题 ({currentLimits.presencePenalty.max})</span>
                </div>
              </div>
            )}

            {/* Repetition Penalty (Ollama) */}
            {currentLimits.repetitionPenalty && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">重复惩罚</label>
                    <ParameterHelp parameter="repetitionPenalty" provider={selectedModel?.provider} />
                  </div>
                  <span className="text-sm px-2 py-1 rounded bg-gray-100 text-gray-500">
                    {(parameters.repetitionPenalty || currentLimits.repetitionPenalty.default).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={currentLimits.repetitionPenalty.min}
                  max={currentLimits.repetitionPenalty.max}
                  step="0.05"
                  value={parameters.repetitionPenalty || currentLimits.repetitionPenalty.default}
                  onChange={(e) => updateParameter('repetitionPenalty', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>允许重复 ({currentLimits.repetitionPenalty.min})</span>
                  <span>避免重复 ({currentLimits.repetitionPenalty.max})</span>
                </div>
              </div>
            )}

            {/* OpenAI Responses API 配置 */}
            {selectedModel?.provider === 'openai' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-purple-800">⚡ Responses API</span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                        {parameters.useResponsesAPI ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {parameters.useResponsesAPI 
                        ? '使用有状态对话模式（非流式）' 
                        : '使用标准流式API'
                      }
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parameters.useResponsesAPI ?? false}
                      onChange={(e) => updateParameter('useResponsesAPI', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>
            )}

            {/* Research 模型工具配置 */}
            {isResearchModel(selectedModel?.model) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-blue-800">🔬 Research 模型工具</label>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    深度研究模式
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-700">🌐 网络搜索</span>
                      <span className="text-xs text-gray-500">联网获取实时信息</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parameters.researchTools?.webSearch ?? true}
                        onChange={(e) => updateResearchTool('webSearch', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-700">📊 代码解释器</span>
                      <span className="text-xs text-gray-500">数据分析和计算</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parameters.researchTools?.codeInterpreter ?? true}
                        onChange={(e) => updateResearchTool('codeInterpreter', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-700">📁 文件搜索</span>
                      <span className="text-xs text-gray-500">搜索和分析文档</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parameters.researchTools?.fileSearch ?? true}
                        onChange={(e) => updateResearchTool('fileSearch', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-700">⏱️ 后台模式</span>
                      <span className="text-xs text-gray-500">用于长时间研究任务</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parameters.background ?? true}
                        onChange={(e) => updateParameter('background', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-700">
                  💡 提示：Research 模型推荐启用所有工具以获得最佳研究效果
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-600 mb-2">
                🎯 当前配置: {selectedModel?.provider?.toUpperCase() || 'AI'} - {selectedModel?.model || 'Model'}
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                <div className="bg-gray-50 rounded p-1 text-center">
                  <div className="font-medium">Temperature</div>
                  <div>{currentLimits.temperature.min}-{currentLimits.temperature.max}</div>
                </div>
                <div className="bg-gray-50 rounded p-1 text-center">
                  <div className="font-medium">Max Tokens</div>
                  <div>{(currentLimits.maxTokens.max / 1000).toFixed(0)}K</div>
                </div>
                <div className="bg-gray-50 rounded p-1 text-center">
                  <div className="font-medium">Top-P</div>
                  <div>{currentLimits.topP.min}-{currentLimits.topP.max}</div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
