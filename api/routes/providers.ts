/**
 * AI服务提供商配置相关的API路由
 * 处理用户的AI服务配置、测试连接等功能
 */
import { Router, type Request, type Response } from 'express';
import { jsonDatabase } from '../services/json-database.js';
import { aiServiceManager } from '../services/ai-service-manager.js';
import { AIProvider } from '../services/types.js';


const router = Router();

// 初始化JSON数据库
let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    await jsonDatabase.init();
    dbInitialized = true;
    console.log('JSON Database initialized successfully');
  }
  return jsonDatabase;
}

// 支持的AI服务提供商列表 - 使用系统预设的默认模型列表
const SUPPORTED_PROVIDERS = [
  {
    name: 'openai',
    displayName: 'OpenAI',
    defaultModels: ['gpt-5', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultBaseUrl: 'https://api.openai.com/v1'
  },
  {
    name: 'claude',
    displayName: 'Anthropic Claude',
    defaultModels: ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
    defaultBaseUrl: 'https://api.anthropic.com'
  },
  {
    name: 'gemini',
    displayName: 'Google Gemini',
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1'
  },
  {
    name: 'xai',
    displayName: 'xAI Grok',
    defaultModels: ['grok-4', 'grok-3', 'grok-2-1212', 'grok-2-vision-1212'],
    defaultBaseUrl: 'https://api.x.ai/v1'
  },
  {
    name: 'ollama',
    displayName: 'Ollama',
    defaultModels: [], // Ollama模型需要动态获取，不设置默认模型
    defaultBaseUrl: 'http://localhost:11434/v1'
  }
];

/**
 * 获取用户配置的AI服务提供商及其模型列表
 * GET /api/providers
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      // 如果没有用户ID，返回空的提供商列表，因为没有配置就不应该显示任何模型
      res.json({
        success: true,
        data: []
      });
      return;
    }

    // 获取用户配置的提供商
    const db = await ensureDatabaseInitialized();
    const { data: userConfigs, error } = await db.getAIProvidersByUserId(userId);

    if (error) {
      console.error('获取用户配置失败:', error);
      // 如果获取失败，返回空列表而不是硬编码模型
      res.json({
        success: true,
        data: []
      });
      return;
    }

    // 如果用户没有配置任何提供商，返回空列表
    if (!userConfigs || userConfigs.length === 0) {
      res.json({
        success: true,
        data: []
      });
      return;
    }

    // 去重用户配置：每个提供商只保留一个配置，优先选择有动态模型的或最新的配置
    const uniqueConfigs = new Map<string, any>();
    userConfigs.forEach((config: any) => {
      const existing = uniqueConfigs.get(config.provider_name);
      if (!existing) {
        uniqueConfigs.set(config.provider_name, config);
      } else {
        // 优先保留有动态模型的配置
        const configHasDynamic = config.available_models && Array.isArray(config.available_models) && 
          config.available_models.some((model: any) => model && typeof model === 'object' && ('id' in model || 'name' in model));
        const existingHasDynamic = existing.available_models && Array.isArray(existing.available_models) && 
          existing.available_models.some((model: any) => model && typeof model === 'object' && ('id' in model || 'name' in model));
        
        if (configHasDynamic && !existingHasDynamic) {
          // 当前配置有动态模型，现存配置没有，使用当前配置
          uniqueConfigs.set(config.provider_name, config);
        } else if (!configHasDynamic && existingHasDynamic) {
          // 现存配置有动态模型，当前配置没有，保持现存配置
          // 不做任何操作
        } else {
          // 都有或都没有动态模型，选择更新时间更晚的
          if (new Date(config.updated_at) > new Date(existing.updated_at)) {
            uniqueConfigs.set(config.provider_name, config);
          }
        }
      }
    });

    // 返回用户配置的提供商和模型 - 优先显示默认模型，如有动态模型则替换
    const configuredProviders = Array.from(uniqueConfigs.values()).map((config: any) => {
      const defaultProvider = SUPPORTED_PROVIDERS.find(p => p.name === config.provider_name);
      
      // 处理模型列表：优先使用动态模型，如果没有则使用默认模型
      let modelsList = [];
      
      // 检查是否有动态获取的模型
      if (config.available_models && Array.isArray(config.available_models) && config.available_models.length > 0) {
        const hasDynamicModels = config.available_models.some((model: any) => 
          model && typeof model === 'object' && ('id' in model || 'name' in model)
        );
        
        if (hasDynamicModels) {
          // 有动态模型，使用动态模型（过滤非聊天模型）
          modelsList = config.available_models.filter((model: any) => {
            if (model && typeof model === 'object' && ('id' in model || 'name' in model)) {
              const modelId = model.id || model.name;
              
              // 检查是否为聊天模型
              if (model.visibleInChat === false) {
                return false;
              } else if (model.visibleInChat === undefined) {
                const lowerModelId = modelId.toLowerCase();
                if (lowerModelId.includes('whisper') || lowerModelId.includes('tts') || 
                    lowerModelId.includes('dall-e') || lowerModelId.includes('embedding') ||
                    lowerModelId.includes('audio') || lowerModelId.includes('realtime') ||
                    lowerModelId.includes('transcribe') || lowerModelId.includes('search') ||
                    lowerModelId.includes('instruct') || lowerModelId.includes('codex') ||
                    lowerModelId.includes('omni') || lowerModelId.includes('gpt-image') ||
                    lowerModelId === 'davinci-002' || lowerModelId.includes('babbage')) {
                  return false;
                }
              }
              
              return model.visible !== false;
            }
            return false;
          }).map((model: any) => {
            return model.id || model.name || model;
          });
        }
      }
      
      // 如果没有动态模型，使用系统预设的默认模型列表作为兜底
      if (modelsList.length === 0 && defaultProvider?.defaultModels) {
        modelsList = defaultProvider.defaultModels;
      }
      
      return {
        provider_name: config.provider_name,
        id: config.provider_name,
        name: defaultProvider?.displayName || config.provider_name,
        models: modelsList,
        config: {
          model: config.default_model || (modelsList.length > 0 ? modelsList[0] : '')
        }
      };
    });

    res.json({
      success: true,
      data: configuredProviders
    });
  } catch (error) {
    console.error('获取提供商列表错误:', error);
    // 发生错误时返回空列表，不返回硬编码模型
    res.json({
      success: true,
      data: []
    });
  }
});

/**
 * 获取支持的AI服务提供商列表
 * GET /api/providers/supported
 */
router.get('/supported', async (_req: Request, res: Response): Promise<void> => {
  try {
    const supportedProviders = aiServiceManager.getSupportedProviders();
    const providers = supportedProviders.map(provider => {
      const defaultConfig = aiServiceManager.getDefaultConfig(provider);
      
      // 定义提供商信息映射
      const providerInfoMap: Record<string, any> = {
        openai: {
          name: 'OpenAI',
          description: 'GPT Series Models',
          requiresApiKey: true
        },
        claude: {
          name: 'Anthropic Claude',
          description: 'Claude Series Models',
          requiresApiKey: true
        },
        gemini: {
          name: 'Google Gemini',
          description: 'Gemini Series Models',
          requiresApiKey: true
        },
        xai: {
          name: 'xAI Grok',
          description: 'Grok Series Models',
          requiresApiKey: true
        },
        ollama: {
          name: 'Ollama',
          description: 'Locally running open-source models',
          requiresApiKey: false
        }
      };
      
      const providerInfo = providerInfoMap[provider];

      // 过滤掉内部适配器或未知提供商
      if (!providerInfo) {
        return null;
      }

      return {
        id: provider,
        ...providerInfo,
        defaultConfig
      };
    }).filter(providerData => providerData !== null); // 过滤掉 null 值

    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('获取支持的提供商列表错误:', error);
    res.status(500).json({ 
      success: false,
      error: '获取支持的提供商列表失败' 
    });
  }
});

/**
 * 获取用户的AI服务配置
 * GET /api/providers/config
 */
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.query.userId as string;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    const { data, error } = await db.getAIProvidersByUserId(userId);

    if (error) {
      res.status(500).json({
        success: false,
        error: '获取配置失败'
      });
      return;
    }

    // 去重用户配置：每个提供商只保留一个配置，优先选择有动态模型的或最新的配置
    let finalData = data || [];
    if (finalData.length > 0) {
      const uniqueConfigs = new Map<string, any>();
      finalData.forEach((config: any) => {
        const existing = uniqueConfigs.get(config.provider_name);
        if (!existing) {
          uniqueConfigs.set(config.provider_name, config);
        } else {
          // 优先保留有动态模型的配置
          const configHasDynamic = config.available_models && Array.isArray(config.available_models) && 
            config.available_models.some((model: any) => model && typeof model === 'object' && ('id' in model || 'name' in model));
          const existingHasDynamic = existing.available_models && Array.isArray(existing.available_models) && 
            existing.available_models.some((model: any) => model && typeof model === 'object' && ('id' in model || 'name' in model));
          
          if (configHasDynamic && !existingHasDynamic) {
            // 当前配置有动态模型，现存配置没有，使用当前配置
            uniqueConfigs.set(config.provider_name, config);
          } else if (!configHasDynamic && existingHasDynamic) {
            // 现存配置有动态模型，当前配置没有，保持现存配置
            // 不做任何操作
          } else {
            // 都有或都没有动态模型，选择更新时间更晚的
            if (new Date(config.updated_at) > new Date(existing.updated_at)) {
              uniqueConfigs.set(config.provider_name, config);
            }
          }
        }
      });
      finalData = Array.from(uniqueConfigs.values());
    }

    res.json({
      success: true,
      data: finalData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 保存或更新AI服务配置
 * POST /api/providers/config
 */
router.post('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      userId, 
      providerName, 
      apiKey, 
      baseUrl, 
      availableModels = [], 
      defaultModel,
      extraConfig = {}
    } = req.body;
    
    if (!userId || !providerName) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
      return;
    }

    // 检查是否是支持的提供商
    const supportedProvider = SUPPORTED_PROVIDERS.find(p => p.name === providerName);
    if (!supportedProvider) {
      res.status(400).json({
        success: false,
        error: '不支持的AI服务提供商'
      });
      return;
    }

    // 验证Base URL格式
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          res.status(400).json({
            success: false,
            error: 'Base URL必须使用http或https协议'
          });
          return;
        }
      } catch (urlError) {
        res.status(400).json({
          success: false,
          error: 'Base URL格式无效，请输入有效的URL地址'
        });
        return;
      }
    }

    // 使用JSON数据库保存配置
    const db = await ensureDatabaseInitialized();
    
    // 处理模型列表：只使用真正从API获取的模型，不再fallback到默认模型
    let finalModels;
    if (Array.isArray(availableModels)) {
      finalModels = availableModels; // 直接使用传入的模型，可能是空数组
    } else {
      // 没有传入availableModels参数，保持原有模型或使用空数组
      const { data: existingConfig } = await db.getAIProvidersByUserId(userId);
      const currentConfig = existingConfig?.find((c: any) => c.provider_name === providerName);
      finalModels = currentConfig?.available_models || []; // 不再fallback到默认模型
    }
    
    const configData = {
      user_id: userId,
      provider_name: providerName,
      api_key: apiKey,
      base_url: baseUrl || supportedProvider.defaultBaseUrl,
      available_models: finalModels,
      default_model: defaultModel || (finalModels.length > 0 ? (typeof finalModels[0] === 'string' ? finalModels[0] : finalModels[0].id || finalModels[0].name || '') : ''),
      is_active: true,
      // 合并额外的配置字段（如use_responses_api等）
      ...extraConfig
    };
    
    // 使用新的更新方法
    const result = await db.updateAIProviderConfig(userId, providerName, configData);
    
    const { data, error } = result;

    if (error) {
      res.status(500).json({
        success: false,
        error: '保存配置失败'
      });
      return;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 重置所有AI服务提供商的模型配置到默认状态
 * POST /api/providers/reset
 */
router.post('/reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 获取用户的所有AI服务提供商配置
    const { data: userConfigs, error: getError } = await db.getAIProvidersByUserId(userId);
    
    if (getError) {
      console.error('获取用户配置失败:', getError);
      res.status(500).json({
        success: false,
        error: '获取用户配置失败'
      });
      return;
    }

    let resetCount = 0;
    
    // 如果用户有配置，则清空所有提供商的available_models字段
    if (userConfigs && userConfigs.length > 0) {
      for (const config of userConfigs) {
        // 重置时不再恢复默认模型，直接清空
        const { error: updateError } = await db.updateAIProviderConfig(userId, config.provider_name, {
          user_id: userId,
          provider_name: config.provider_name,
          api_key: config.api_key,
          base_url: config.base_url,
          available_models: [], // 清空模型列表，不恢复默认模型
          default_model: '', // 清空默认模型
          is_active: config.is_active
        });
        
        if (updateError) {
          console.error(`重置${config.provider_name}配置失败:`, updateError);
        } else {
          resetCount++;
        }
      }
    }
    
    res.json({
      success: true,
      message: '所有模型配置已重置到默认状态',
      data: {
        resetCount
      }
    });
    
  } catch (error) {
    console.error('重置模型配置错误:', error);
    res.status(500).json({
      success: false,
      error: '重置模型配置失败'
    });
  }
});

/**
 * 测试AI服务连接
 * POST /api/providers/test
 */
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerName, apiKey, baseUrl, model } = req.body;
    
    if (!providerName) {
      res.status(400).json({
        success: false,
        error: '缺少提供商名称'
      });
      return;
    }

    // 清理API Key值（处理"undefined"字符串的情况）
    const cleanApiKey = (apiKey === 'undefined' || apiKey === 'null' || !apiKey) ? undefined : apiKey;
    
    // 验证API Key（Ollama除外）
    if (providerName !== 'ollama' && !cleanApiKey) {
      res.status(400).json({
        success: false,
        error: 'API Key不能为空'
      });
      return;
    }

    // 验证提供商是否支持
    const supportedProviders = aiServiceManager.getSupportedProviders();
    if (!supportedProviders.includes(providerName as AIProvider)) {
      res.status(400).json({ 
        success: false, 
        error: `不支持的AI服务提供商: ${providerName}` 
      });
      return;
    }

    // 验证配置（连接测试时不需要验证model）
    const errors: string[] = [];
    
    // 验证Base URL格式
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Base URL必须使用http或https协议');
        }
      } catch (urlError) {
        errors.push('Base URL格式无效，请输入有效的URL地址');
      }
    }
    
    // 特定提供商验证
    switch (providerName) {
      case 'openai':
      case 'claude':
      case 'gemini':
      case 'xai':
        if (!apiKey) {
          errors.push('API Key不能为空');
        }
        break;
      case 'ollama':
        // Ollama通常不需要API Key，但需要确保服务运行
        if (!baseUrl) {
          errors.push('Base URL不能为空');
        }
        break;
    }

    if (errors.length > 0) {
      res.status(400).json({ 
        success: false, 
        error: errors.join(', ') 
      });
      return;
    }

    // 测试连接
    console.log(`[DEBUG] Testing connection for ${providerName} with config:`, {
      provider: providerName,
      apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined',
      baseUrl: baseUrl || 'default',
      model: model
    });
    
    // 首先测试基础连接
    const isConnected = await aiServiceManager.testConnection(providerName as AIProvider, {
      provider: providerName as AIProvider,
      model: model || 'default',
      apiKey: cleanApiKey,
      baseUrl
    });
    
    console.log(`[DEBUG] Connection test result for ${providerName}:`, isConnected);

    if (!isConnected) {
      res.status(400).json({ 
        success: false, 
        error: `${providerName}连接测试失败，请检查API Key和Base URL配置` 
      });
      return;
    }

    // 获取可用模型列表
    let models: { id: string; name: string }[] = [];
    try {
      models = await aiServiceManager.getAvailableModels(providerName as AIProvider, {
        provider: providerName as AIProvider,
        model: model || 'default',
        apiKey,
        baseUrl
      });
    } catch (modelError) {
      console.error(`[DEBUG] Failed to get models for ${providerName}:`, modelError);
      res.json({
        success: false,
        error: `连接成功但无法获取模型列表: ${modelError instanceof Error ? modelError.message : '未知错误'}`
      });
      return;
    }

    // 如果指定了模型，直接进行实际测试（跳过模型列表检查）
    if (model && model !== 'default') {
      try {
        console.log(`[DEBUG] Testing specific model: ${model}`);
        const testResult = await aiServiceManager.testSpecificModel(providerName as AIProvider, {
          provider: providerName as AIProvider,
          model: model,
          apiKey: cleanApiKey,
          baseUrl
        });
        
        if (!testResult) {
          res.json({
            success: false,
            error: `模型 "${model}" 测试失败: 无法正常响应测试请求。\n\n可用模型列表:\n${models.map(m => `• ${m.id}${m.name !== m.id ? ` (${m.name})` : ''}`).join('\n')}`
          });
          return;
        }
      } catch (testError) {
        console.error(`[DEBUG] Model test failed for ${model}:`, testError);
        res.json({
          success: false,
          error: `模型 "${model}" 测试失败: ${testError instanceof Error ? testError.message : '未知错误'}\n\n可用模型列表:\n${models.map(m => `• ${m.id}${m.name !== m.id ? ` (${m.name})` : ''}`).join('\n')}`
        });
        return;
      }
    } else if (providerName === 'ollama') {
      // Ollama需要用户先获取模型列表并选择模型
      res.json({
        success: false,
        error: `Ollama需要指定具体的模型进行测试。请先点击"获取模型列表"按钮获取已安装的模型，然后选择一个模型进行测试。\n\n可用模型列表:\n${models.map(m => `• ${m.id}${m.name !== m.id ? ` (${m.name})` : ''}`).join('\n')}`
      });
      return;
    }
    
    // 所有验证通过，返回成功结果
    res.json({
      success: true,
      data: {
        provider: providerName,
        model: model || 'default',
        message: model ? `连接测试成功，模型 "${model}" 可用` : '连接测试成功',
        models
      }
    });
  } catch (error: any) {
    console.error('测试连接错误:', error);
    res.status(500).json({
      success: false,
      error: `连接测试失败: ${error.message}`
    });
  }
});

/**
 * 获取指定提供商的模型列表
 * POST /api/providers/models
 */
router.post('/models', async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerName, apiKey, baseUrl } = req.body;
    
    if (!providerName) {
      res.status(400).json({
        success: false,
        error: '缺少提供商名称'
      });
      return;
    }

    // 清理API Key值（处理"undefined"字符串的情况）
    const cleanApiKey = (apiKey === 'undefined' || apiKey === 'null' || !apiKey) ? undefined : apiKey;
    
    // 验证API Key（除了Ollama外都需要）
    if (providerName !== 'ollama' && !cleanApiKey) {
      res.status(400).json({
        success: false,
        error: 'API Key是必填项'
      });
      return;
    }

    // 验证Base URL格式
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          res.status(400).json({
            success: false,
            error: 'Base URL必须使用http或https协议'
          });
          return;
        }
      } catch (urlError) {
        res.status(400).json({
          success: false,
          error: 'Base URL格式无效，请输入有效的URL地址'
        });
        return;
      }
    }

    // 验证提供商是否支持
    const supportedProviders = aiServiceManager.getSupportedProviders();
    if (!supportedProviders.includes(providerName as AIProvider)) {
      res.status(400).json({ 
        success: false, 
        error: `不支持的AI服务提供商: ${providerName}` 
      });
      return;
    }

    // 获取默认配置
    const defaultConfig = aiServiceManager.getDefaultConfig(providerName as AIProvider);
    
    // 构建配置对象
    const config = {
      provider: providerName as AIProvider,
      model: 'default',
      apiKey: cleanApiKey || '',
      baseUrl: baseUrl || defaultConfig.baseUrl
    };

    try {
      let allModels: { id: string; name: string }[] = [];
      
      // 获取普通模型列表
      const models = await aiServiceManager.getAvailableModels(providerName as AIProvider, config);
      allModels = [...models];
      
      // 如果是 OpenAI，还要尝试获取 Research 模型
      if (providerName === 'openai') {
        try {
          console.log('[INFO] 尝试获取 OpenAI Research 模型...');
          const researchModels = await aiServiceManager.getAvailableModels('openai-responses' as AIProvider, config);
          
          console.log('[DEBUG] OpenAI Responses API 返回的所有模型:', researchModels.map(m => m.id));
          
          // 使用模式匹配筛选 Research 模型（更灵活的长远方案）
          const actualResearchModels = researchModels.filter(model => {
            const modelId = model.id.toLowerCase();
            console.log(`[DEBUG] 检查模型: ${model.id}, 小写: ${modelId}`);
            // 匹配以下模式：
            // 1. 包含 "-research" 的模型（如 o3-deep-research）
            // 2. 包含 "-research-" 的模型（如 o3-deep-research-2025-06-26）
            // 3. 包含 "deep-research" 的模型
            // 4. 以 "research" 结尾的模型
            const isMatch = modelId.includes('-research') || 
                           modelId.includes('deep-research') || 
                           modelId.endsWith('-research') || 
                           modelId.endsWith('research');
            console.log(`[DEBUG] 模型 ${model.id} 匹配结果: ${isMatch}`);
            return isMatch;
          });
          
          console.log('[DEBUG] 筛选后的 Research 模型:', actualResearchModels.map(m => m.id));
          
          if (actualResearchModels.length > 0) {
            console.log(`[INFO] 找到 ${actualResearchModels.length} 个 Research 模型:`, actualResearchModels.map(m => m.id));
            allModels = [...allModels, ...actualResearchModels];
          } else {
            console.log('[INFO] 未找到 Research 模型，可能需要特殊权限或账户升级');
          }
        } catch (researchError: any) {
          console.log('[INFO] 获取 Research 模型失败（这是正常的，可能需要特殊权限）:', researchError.message);
        }
      }
      
      res.json({
        success: true,
        data: {
          provider: providerName,
          models: allModels
        }
      });
    } catch (error: any) {
      console.error(`获取${providerName}模型列表错误:`, error);
      
      // 根据错误类型返回不同的错误信息
      let errorMessage = '获取模型列表失败';
      
      if (error.message) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = 'API Key无效，请检查密钥是否正确';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          errorMessage = 'API Key权限不足或已过期';
        } else if (error.message.includes('429') || error.message.includes('rate limit')) {
          errorMessage = 'API调用频率超限，请稍后重试';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
          errorMessage = '连接超时，请检查网络或服务地址';
        } else {
          errorMessage = `获取模型列表失败: ${error.message}`;
        }
      }
      
      // 返回错误响应而不是抛出异常
      res.json({
        success: false,
        error: errorMessage,
        data: {
          provider: providerName,
          models: []
        }
      });
    }
  } catch (error: any) {
    console.error('获取模型列表外层错误:', error);
    
    // 检查是否是AIServiceError
    if (error.name === 'AIServiceError') {
      // 直接使用AIServiceError的错误信息
      res.json({
        success: false,
        error: error.message || '获取模型列表失败',
        data: {
          provider: req.body?.providerName || 'unknown',
          models: []
        }
      });
    } else {
      // 其他类型的错误
      res.status(500).json({
        success: false,
        error: `服务器内部错误: ${error.message}`,
        data: {
          provider: req.body?.providerName || 'unknown',
          models: []
        }
      });
    }
  }
});

/**
 * 删除AI服务配置 - 支持按用户ID和提供商名称删除
 * DELETE /api/providers/config
 */
router.delete('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, providerName } = req.query as { userId: string; providerName: string };
    
    if (!userId || !providerName) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数：userId 和 providerName'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 获取用户的所有配置，查找要删除的配置
    const { data: userProviders, error: getError } = await db.getAIProvidersByUserId(userId);
    
    if (getError) {
      res.status(500).json({
        success: false,
        error: '获取配置失败'
      });
      return;
    }

    // 查找匹配的配置
    const providersToDelete = userProviders?.filter(p => p.provider_name === providerName) || [];
    
    if (providersToDelete.length === 0) {
      res.json({
        success: true,
        message: '配置不存在或已删除'
      });
      return;
    }

    // 使用数据库的删除方法删除每个匹配的配置
    let deletedCount = 0;
    for (const provider of providersToDelete) {
      const { error: deleteError } = await db.from('ai_providers').delete().eq('id', provider.id);
      if (!deleteError) {
        deletedCount++;
      }
    }

    res.json({
      success: true,
      message: `已删除 ${deletedCount} 个 ${providerName} 配置`
    });
  } catch (error) {
    console.error('删除配置错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});

/**
 * 设置默认AI服务提供商
 * PUT /api/providers/default
 */
router.put('/default', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, providerName } = req.body;
    
    if (!userId || !providerName) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
      return;
    }

    // 更新用户的默认提供商
    const db = await ensureDatabaseInitialized();
    const { error } = await db.from('users').update({ default_provider: providerName }).eq('id', userId);

    if (error) {
      res.status(500).json({
        success: false,
        error: '设置默认提供商失败'
      });
      return;
    }

    res.json({
      success: true,
      message: '默认提供商设置成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
});


/**
 * 重置所有动态获取的模型到默认状态
 * POST /api/providers/reset-models
 */
router.post('/reset-models', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: '缺少用户ID'
      });
      return;
    }

    const db = await ensureDatabaseInitialized();
    
    // 获取该用户所有的AI提供商配置
    const { data: userConfigs, error: fetchError } = await db.getAIProvidersByUserId(userId);
    
    if (fetchError) {
      console.error('获取用户配置失败:', fetchError);
      res.status(500).json({
        success: false,
        error: '获取用户配置失败'
      });
      return;
    }
    
    if (!userConfigs || userConfigs.length === 0) {
      res.json({
        success: true,
        message: '没有找到需要重置的配置'
      });
      return;
    }
    
    // 清除每个提供商的available_models字段
    const resetPromises = userConfigs.map((config: any) => {
      return db.from('ai_providers')
        .update({ 
          available_models: [],
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);
    });
    
    // 等待所有重置操作完成
    const results = await Promise.allSettled(resetPromises);
    
    // 检查是否有失败的操作
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error('部分重置操作失败:', failures);
      res.status(500).json({
        success: false,
        error: `重置失败，${failures.length}个操作出错`
      });
      return;
    }
    
    console.log(`成功重置用户${userId}的所有模型配置`);
    res.json({
      success: true,
      message: `成功重置${userConfigs.length}个提供商的模型列表`
    });
    
  } catch (error: any) {
    console.error('重置模型错误:', error);
    res.status(500).json({
      success: false,
      error: `服务器内部错误: ${error.message}`
    });
  }
});

export default router;