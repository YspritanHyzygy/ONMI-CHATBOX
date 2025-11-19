import express from 'express';
import { StaticDataManager } from '../../src/lib/model-parameters/static-manager.js';
import { DynamicDataManager } from '../../src/lib/model-parameters/dynamic-manager.js';

const router = express.Router();

// 获取指定提供商和模型的参数限制
router.get('/:provider/:model?', async (req, res) => {
  try {
    const { provider, model } = req.params;
    
    console.log(`[ModelLimits API] 获取参数限制: ${provider}${model ? `/${model}` : ''}`);
    
    let limits = null;
    
    // 首先尝试动态获取（仅对Gemini）
    if (provider === 'gemini') {
      try {
        const dynamicManager = new DynamicDataManager();
        await dynamicManager.initialize();
        limits = await dynamicManager.getModelParameters(provider, model || 'gemini-1.5-pro');
        console.log(`[ModelLimits API] 动态获取成功: ${provider}/${model}`);
      } catch (error: any) {
        console.warn(`[ModelLimits API] 动态获取失败，回退到静态: ${error.message}`);
      }
    }
    
    // 如果动态获取失败或不适用，使用静态数据
    if (!limits) {
      const staticManager = new StaticDataManager();
      await staticManager.initialize();
      limits = await staticManager.getModelParameters(provider, model || 'default');
      console.log(`[ModelLimits API] 静态获取成功: ${provider}/${model}`);
    }
    
    if (!limits) {
      return res.status(404).json({
        success: false,
        error: `未找到模型参数限制: ${provider}${model ? `/${model}` : ''}`
      });
    }
    
    res.json(limits);
    
  } catch (error: any) {
    console.error('[ModelLimits API] 获取参数限制失败:', error);
    res.status(500).json({
      success: false,
      error: `获取模型参数限制失败: ${error.message}`
    });
  }
});

// 获取所有可用的提供商列表
router.get('/providers', async (_req, res) => {
  try {
    const staticManager = new StaticDataManager();
    await staticManager.initialize();
    const providers = await staticManager.getAllProviders();
    
    res.json({
      success: true,
      providers
    });
    
  } catch (error: any) {
    console.error('[ModelLimits API] 获取提供商列表失败:', error);
    res.status(500).json({
      success: false,
      error: `获取提供商列表失败: ${error.message}`
    });
  }
});

// 获取指定提供商的所有模型
router.get('/:provider/models', async (req, res) => {
  try {
    const { provider } = req.params;
    
    let models: string[] = [];
    
    // 首先尝试动态获取（仅对Gemini）
    if (provider === 'gemini') {
      try {
        const dynamicManager = new DynamicDataManager();
        await dynamicManager.initialize();
        const modelEntries = await dynamicManager.getProviderModels(provider);
        models = modelEntries.map(entry => entry.modelId);
        console.log(`[ModelLimits API] 动态获取模型列表成功: ${provider}`);
      } catch (error: any) {
        console.warn(`[ModelLimits API] 动态获取模型列表失败，回退到静态: ${error.message}`);
      }
    }
    
    // 如果动态获取失败或不适用，使用静态数据
    if (!models || models.length === 0) {
      const staticManager = new StaticDataManager();
      await staticManager.initialize();
      const modelEntries = await staticManager.getProviderModels(provider);
      models = modelEntries.map(entry => entry.modelId);
      console.log(`[ModelLimits API] 静态获取模型列表成功: ${provider}`);
    }
    
    res.json({
      success: true,
      models
    });
    
  } catch (error: any) {
    console.error('[ModelLimits API] 获取模型列表失败:', error);
    res.status(500).json({
      success: false,
      error: `获取模型列表失败: ${error.message}`
    });
  }
});

export default router;
