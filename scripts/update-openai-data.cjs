#!/usr/bin/env node

/**
 * OpenAI 模型参数数据更新脚本
 * 从Azure OpenAI官方文档爬取完整模型列表，自动更新本地配置文件
 * 使用方式: node scripts/update-openai-data.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');
require('dotenv').config();

// 配置
const CONFIG = {
  outputPath: path.join(__dirname, '../src/lib/model-parameters/data/openai.json'),
  backupPath: path.join(__dirname, '../src/lib/model-parameters/data/openai.backup.json'),
  // 是否启用API验证（设为false将保留所有文档模型）
  enableApiValidation: process.env.ENABLE_API_VALIDATION !== 'false'
};

class OpenAIDataUpdater {
  /**
   * 创建备份文件
   */
  createBackup() {
    try {
      if (fs.existsSync(CONFIG.outputPath)) {
        const currentData = fs.readFileSync(CONFIG.outputPath, 'utf8');
        fs.writeFileSync(CONFIG.backupPath, currentData);
        console.log(`✅ 备份创建成功: ${CONFIG.backupPath}`);
      } else {
        console.log('⚠️  原文件不存在，跳过备份');
      }
    } catch (error) {
      console.error('❌ 创建备份失败:', error.message);
      throw error;
    }
  }

  /**
   * 通过OpenAI API获取真实可用的模型列表
   */
  async fetchRealModels() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log('⚠️  未找到OPENAI_API_KEY，跳过API验证');
      return [];
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'OpenAI-Node'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              console.log(`⚠️  API请求失败，状态码: ${res.statusCode}`);
              resolve([]);
              return;
            }
            
            const response = JSON.parse(data);
            if (response.data && Array.isArray(response.data)) {
              const models = response.data.map(model => ({
                id: model.id,
                created: model.created,
                owned_by: model.owned_by
              }));
              resolve(models);
            } else {
              console.log('⚠️  API响应格式异常');
              resolve([]);
            }
          } catch (error) {
            console.log('⚠️  解析API响应失败:', error.message);
            resolve([]);
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('⚠️  API请求失败:', error.message);
        resolve([]);
      });
      
      req.setTimeout(10000, () => {
        console.log('⚠️  API请求超时');
        req.destroy();
        resolve([]);
      });
      
      req.end();
    });
  }
  async fetchAzureOpenAIModels() {
    const url = 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/models?tabs=global-standard%2Cstandard-chat-completions';
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const dom = new JSDOM(data);
            const document = dom.window.document;
            
            // 解析模型表格数据
            const models = this.parseModelTable(document);
            resolve(models);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 解析模型表格数据
   */
  parseModelTable(document) {
    const models = [];
    
    // 查找包含模型信息的表格
    const tables = document.querySelectorAll('table');
    
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      if (rows.length < 2) continue;
      
      // 检查是否是模型表格（通过表头判断）
      const headerCells = rows[0].querySelectorAll('th, td');
      const headers = Array.from(headerCells).map(cell => cell.textContent.trim().toLowerCase());
      
      if (headers.some(header => header.includes('model') || header.includes('deployment'))) {
        // 解析模型行
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells.length >= 2) {
            const modelName = cells[0].textContent.trim();
            if (this.isValidModelName(modelName)) {
              models.push({
                modelId: modelName,
                displayName: this.formatDisplayName(modelName),
                description: this.getModelDescription(modelName)
              });
            }
          }
        }
      }
    }
    
    // 如果没有找到表格数据，使用备用模型列表
    if (models.length === 0) {
      console.log('⚠️  未能从表格中解析到模型，使用备用模型列表');
      return this.getFallbackModels();
    }
    
    // 去重并排序
    const uniqueModels = models.filter((model, index, self) => 
      index === self.findIndex(m => m.modelId === model.modelId)
    );
    
    return uniqueModels.sort((a, b) => a.modelId.localeCompare(b.modelId));
  }

  /**
   * 比对文档模型与真实API模型，筛选出真正可用的模型
   */
  filterValidModels(docModels, apiModels) {
    if (!apiModels || apiModels.length === 0) {
      console.log('🔄 无API数据，使用所有文档模型');
      return docModels;
    }
    
    const apiModelIds = new Set(apiModels.map(m => m.id.toLowerCase()));
    const validModels = [];
    const skippedModels = [];
    
    for (const docModel of docModels) {
      const normalizedId = this.normalizeModelId(docModel.modelId);
      
      // 检查是否在API模型列表中
      if (this.isModelInAPI(normalizedId, apiModelIds)) {
        validModels.push(docModel);
      } else {
        skippedModels.push(docModel.modelId);
      }
    }
    
    console.log(`✅ 验证完成: ${validModels.length} 个有效模型，${skippedModels.length} 个无效模型`);
    
    if (skippedModels.length > 0) {
      console.log('📋 跳过的模型:', skippedModels.slice(0, 10).join(', '));
      if (skippedModels.length > 10) {
        console.log(`   ... 还有 ${skippedModels.length - 10} 个模型`);
      }
    }
    
    return validModels;
  }
  
  /**
   * 标准化模型ID，用于比对
   */
  normalizeModelId(modelId) {
    return modelId
      .toLowerCase()
      .replace(/\s+/g, '-')  // 空格转连字符
      .replace(/[()]/g, '')  // 移除括号
      .replace(/[-_]+/g, '-')  // 多个连字符合并
      .replace(/^-+|-+$/g, '');  // 移除首尾连字符
  }
  
  /**
   * 检查模型是否在API列表中（支持模糊匹配）
   */
  isModelInAPI(normalizedId, apiModelIds) {
    // 直接匹配
    if (apiModelIds.has(normalizedId)) {
      return true;
    }
    
    // 移除版本号后匹配
    const withoutVersion = normalizedId.replace(/-?\d{4}-\d{2}-\d{2}.*$/, '');
    if (apiModelIds.has(withoutVersion)) {
      return true;
    }
    
    // 特殊映射关系
    const mappings = {
      'gpt-35-turbo': 'gpt-3.5-turbo',
      'gpt-4o-mini': 'gpt-4o-mini',
      'text-embedding-ada-002': 'text-embedding-ada-002'
    };
    
    const mapped = mappings[withoutVersion];
    if (mapped && apiModelIds.has(mapped)) {
      return true;
    }
    
    // 检查是否是API模型的子集（如GPT-4的各种版本）
    for (const apiModelId of apiModelIds) {
      if (apiModelId.includes(withoutVersion) || withoutVersion.includes(apiModelId)) {
        return true;
      }
    }
    
    return false;
  }
  isValidModelName(modelName) {
    // 排除地区名称、分组标题和无效字符串
    const invalidPatterns = [
      /^[A-Z][A-Z\-]+$/,  // 全大写地区名（如 EASTUS, WESTEUROPE）
      /^[a-z]+[a-z\-]*[a-z]+$/,  // 小写地区名（如 eastus, westeurope）
      /^[A-Z][a-z]+[A-Z][a-z]*$/,  // PascalCase地区名（如 EastUs）
      /^(Image generation|Embeddings|Audio|GPT-[0-9.]+$|O-series models)$/i,  // 分组标题
      /version [0-9]/i,  // 版本号说明
      /series$/i,  // 系列名称
      /^(GPT-4o, GPT-4o mini, and GPT-4 Turbo)$/i,  // 组合描述
      /^Model$/i,  // 表头文字
      /^\s*$/  // 空字符串
    ];
    
    // 地区名称列表
    const regions = [
      'australiaeast', 'brazilsouth', 'canadaeast', 'eastus', 'eastus2', 
      'francecentral', 'germanywestcentral', 'italynorth', 'japaneast', 
      'koreacentral', 'northcentralus', 'norwayeast', 'polandcentral', 
      'southafricanorth', 'southcentralus', 'southindia', 'spaincentral', 
      'swedencentral', 'switzerlandnorth', 'uaenorth', 'uksouth', 
      'westeurope', 'westus', 'westus3'
    ];
    
    if (!modelName || modelName.length < 3) return false;
    
    // 检查是否匹配无效模式
    for (const pattern of invalidPatterns) {
      if (pattern.test(modelName)) return false;
    }
    
    // 检查是否是地区名称
    if (regions.includes(modelName.toLowerCase())) return false;
    
    // 必须包含有效的模型前缀
    const validPrefixes = [
      'gpt-', 'o1', 'o3', 'o4', 'text-embedding', 'dall-e', 'whisper', 
      'tts', 'sora', 'codex', 'model-router'
    ];
    
    return validPrefixes.some(prefix => modelName.toLowerCase().startsWith(prefix));
  }

  /**
   * 格式化显示名称
   */
  formatDisplayName(modelId) {
    return modelId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/Gpt/g, 'GPT')
      .replace(/O1/g, 'o1');
  }

  /**
   * 获取模型描述
   */
  getModelDescription(modelId) {
    const descriptions = {
      'gpt-4o': "OpenAI's most advanced multimodal model",
      'gpt-4o-mini': 'Faster and more affordable version of GPT-4o',
      'gpt-4-turbo': 'Advanced GPT-4 model optimized for speed',
      'gpt-4': 'OpenAI\'s most capable model',
      'gpt-3.5-turbo': 'Fast and efficient model for most tasks',
      'o1-preview': 'Advanced reasoning model (preview)',
      'o1-mini': 'Smaller version of o1 reasoning model',
      'text-embedding-ada-002': 'Text embedding model',
      'text-embedding-3-small': 'Small text embedding model',
      'text-embedding-3-large': 'Large text embedding model',
      'dall-e-3': 'AI image generation model',
      'dall-e-2': 'Previous generation image model',
      'whisper': 'Speech-to-text model'
    };
    
    return descriptions[modelId] || `OpenAI ${this.formatDisplayName(modelId)} model`;
  }

  /**
   * 备用模型列表（如果爬取失败时使用）
   */
  getFallbackModels() {
    return [
      { modelId: 'gpt-4o', displayName: 'GPT-4o', description: "OpenAI's most advanced multimodal model" },
      { modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', description: 'Faster and more affordable version of GPT-4o' },
      { modelId: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', description: 'Advanced GPT-4 model optimized for speed' },
      { modelId: 'gpt-4', displayName: 'GPT-4', description: 'OpenAI\'s most capable model' },
      { modelId: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', description: 'Fast and efficient model for most tasks' },
      { modelId: 'gpt-35-turbo', displayName: 'GPT-3.5 Turbo', description: 'Azure OpenAI GPT-3.5 Turbo' },
      { modelId: 'o1-preview', displayName: 'o1 Preview', description: 'Advanced reasoning model (preview)' },
      { modelId: 'o1-mini', displayName: 'o1 Mini', description: 'Smaller version of o1 reasoning model' },
      { modelId: 'o3-mini', displayName: 'o3 Mini', description: 'Latest o3 mini reasoning model' },
      { modelId: 'text-embedding-ada-002', displayName: 'Text Embedding Ada 002', description: 'Text embedding model' },
      { modelId: 'text-embedding-3-small', displayName: 'Text Embedding 3 Small', description: 'Small text embedding model' },
      { modelId: 'text-embedding-3-large', displayName: 'Text Embedding 3 Large', description: 'Large text embedding model' },
      { modelId: 'dall-e-3', displayName: 'DALL-E 3', description: 'AI image generation model' },
      { modelId: 'dall-e-2', displayName: 'DALL-E 2', description: 'Previous generation image model' },
      { modelId: 'whisper', displayName: 'Whisper', description: 'Speech-to-text model' },
      { modelId: 'tts', displayName: 'TTS', description: 'Text-to-speech model' },
      { modelId: 'tts-hd', displayName: 'TTS HD', description: 'High-definition text-to-speech model' }
    ];
  }

  /**
   * 为模型生成配置
   */
  generateModelConfig(modelInfo) {
    const isEmbeddingModel = modelInfo.modelId.includes('embedding');
    const isImageModel = modelInfo.modelId.includes('dall-e');
    const isAudioModel = modelInfo.modelId.includes('whisper');
    const isChatModel = !isEmbeddingModel && !isImageModel && !isAudioModel;
    
    // 基础配置
    const config = {
      modelId: modelInfo.modelId,
      provider: "openai",
      displayName: modelInfo.displayName,
      description: modelInfo.description,
      metadata: {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        source: "azure-docs"
      }
    };
    
    // 只为聊天模型添加参数限制
    if (isChatModel) {
      config.limits = {
        temperature: { min: 0, max: 2, default: 1, step: 0.1 },
        topP: { min: 0, max: 1, default: 1, step: 0.01 },
        frequencyPenalty: { min: -2, max: 2, default: 0, step: 0.1 },
        presencePenalty: { min: -2, max: 2, default: 0, step: 0.1 }
      };
      
      // 根据模型设置maxTokens
      if (modelInfo.modelId.includes('gpt-4o-mini')) {
        config.limits.maxTokens = { min: 1, max: 16384, default: 1024 };
      } else if (modelInfo.modelId.includes('gpt-4')) {
        config.limits.maxTokens = { min: 1, max: 8192, default: 1024 };
      } else if (modelInfo.modelId.includes('o1')) {
        config.limits.maxTokens = { min: 1, max: 32768, default: 1024 };
      } else {
        config.limits.maxTokens = { min: 1, max: 4096, default: 1024 };
      }
    }
    
    // 设置能力
    config.capabilities = {
      supportsStreaming: isChatModel,
      supportsImages: modelInfo.modelId.includes('gpt-4') && !modelInfo.modelId.includes('gpt-4-turbo-preview'),
      supportsTools: isChatModel && !modelInfo.modelId.includes('o1'),
      supportsSystemPrompt: isChatModel
    };
    
    // 设置token限制
    if (isChatModel) {
      if (modelInfo.modelId.includes('o1')) {
        config.capabilities.maxInputTokens = 200000;
        config.capabilities.maxOutputTokens = 100000;
      } else if (modelInfo.modelId.includes('gpt-4')) {
        config.capabilities.maxInputTokens = 128000;
        config.capabilities.maxOutputTokens = 4096;
      } else {
        config.capabilities.maxInputTokens = 16384;
        config.capabilities.maxOutputTokens = 4096;
      }
    }
    
    return config;
  }

  /**
   * 保存模型数据
   */
  saveModelData(modelData) {
    try {
      const jsonContent = JSON.stringify(modelData, null, 2);
      fs.mkdirSync(path.dirname(CONFIG.outputPath), { recursive: true });
      fs.writeFileSync(CONFIG.outputPath, jsonContent, 'utf8');
      
      console.log(`✅ OpenAI模型数据已保存: ${CONFIG.outputPath}`);
      console.log(`📊 更新了 ${Object.keys(modelData).length} 个模型`);
      
      // 显示更新的模型列表
      console.log('📋 更新的模型列表:');
      Object.keys(modelData).forEach((modelId, index) => {
        console.log(`   ${index + 1}. ${modelData[modelId].displayName} (${modelId})`);
      });
      
    } catch (error) {
      console.error('❌ 保存数据失败:', error.message);
      throw error;
    }
  }

  /**
   * 主执行函数
   */
  async execute() {
    try {
      console.log('🚀 开始从Azure OpenAI文档爬取模型数据...');
      
      // 1. 创建备份
      this.createBackup();
      
      // 2. 并行获取文档模型和API模型
      console.log('🔄 同时获取文档模型和API模型列表...');
      const docModelsPromise = this.fetchAzureOpenAIModels().catch(error => {
        console.log('⚠️  文档爬取失败，使用备用列表:', error.message);
        return this.getFallbackModels();
      });
      
      let validModels;
      
      if (CONFIG.enableApiValidation) {
        const apiModelsPromise = this.fetchRealModels().catch(error => {
          console.log('⚠️  API获取失败:', error.message);
          return [];
        });
        
        const [docModels, apiModels] = await Promise.all([docModelsPromise, apiModelsPromise]);
        console.log(`📊 文档模型: ${docModels.length} 个，API模型: ${apiModels.length} 个`);
        
        // 3. 比对并筛选有效模型
        console.log('🔍 比对模型列表，筛选真实可用模型...');
        validModels = this.filterValidModels(docModels, apiModels);
      } else {
        console.log('📝 跳过API验证，使用所有文档模型');
        validModels = await docModelsPromise;
        console.log(`📊 文档模型: ${validModels.length} 个`);
      }
      
      // 4. 生成完整配置
      console.log('⚙️  生成模型配置...');
      const modelData = {};
      
      for (const modelInfo of validModels) {
        modelData[modelInfo.modelId] = this.generateModelConfig(modelInfo);
      }
      
      // 5. 保存数据
      this.saveModelData(modelData);
      
      console.log('🎉 OpenAI模型数据更新完成！');
      console.log('💡 现在OpenAI模型将正确显示frequencyPenalty和presencePenalty参数');
      
      if (CONFIG.enableApiValidation) {
        console.log(`📈 最终保留了 ${Object.keys(modelData).length} 个经过API验证的模型`);
      } else {
        console.log(`📈 最终保留了 ${Object.keys(modelData).length} 个文档模型（未经过API验证）`);
      }
      
    } catch (error) {
      console.error('❌ 更新失败:', error.message);
      console.log('🔄 尝试使用备用模型列表...');
      
      try {
        // 使用备用模型列表
        const fallbackModels = this.getFallbackModels();
        const modelData = {};
        
        for (const modelInfo of fallbackModels) {
          modelData[modelInfo.modelId] = this.generateModelConfig(modelInfo);
        }
        
        this.saveModelData(modelData);
        console.log('✅ 使用备用模型列表更新成功');
        
      } catch (fallbackError) {
        console.error('❌ 备用更新也失败:', fallbackError.message);
        
        // 如果有备份文件，提示恢复
        if (fs.existsSync(CONFIG.backupPath)) {
          console.log('💡 检测到备份文件，可以手动恢复:');
          console.log(`   cp "${CONFIG.backupPath}" "${CONFIG.outputPath}"`);
        }
        
        process.exit(1);
      }
    }
  }
}

// 执行脚本
if (require.main === module) {
  const updater = new OpenAIDataUpdater();
  updater.execute();
}

module.exports = OpenAIDataUpdater;