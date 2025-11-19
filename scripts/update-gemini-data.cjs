#!/usr/bin/env node

/**
 * Gemini模型数据更新脚本
 * 用于独立项目的动态数据获取，当前项目中实现但不使用
 */

const fs = require('fs').promises;
const path = require('path');

// 加载环境变量
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  console.log('✅ dotenv 加载成功');
} catch (error) {
  console.warn('⚠️ dotenv 加载失败，尝试使用系统环境变量');
}

// 配置
const CONFIG = {
  apiKey: process.env.GEMINI_API_KEY?.trim(),
  baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  outputPath: path.join(__dirname, '../src/lib/model-parameters/data/gemini.json'),
  backupPath: path.join(__dirname, '../src/lib/model-parameters/data/gemini.backup.json')
};

class GeminiDataUpdater {
  constructor() {
    this.apiKey = CONFIG.apiKey;
    if (!this.apiKey) {
      console.error('❌ GEMINI_API_KEY环境变量未设置');
      console.log('请在 .env 文件中设置 GEMINI_API_KEY');
      process.exit(1);
    }
    console.log('✅ API Key已设置，开始测试...');
    console.log('API Key长度:', this.apiKey.length);
    console.log('API Key前缀:', this.apiKey.substring(0, 10) + '...');
    console.log('Base URL:', CONFIG.baseUrl);
  }

  async fetchModels() {
    console.log('🔍 获取Gemini模型列表...');
    
    const url = `${CONFIG.baseUrl}/models?key=${this.apiKey}`;
    console.log('请求URL:', url.replace(this.apiKey, '***'));
    
    try {
      // 使用 Node.js 内置的 fetch (Node 18+) 或者 node-fetch
      const fetch = globalThis.fetch || require('node-fetch');
      const response = await fetch(url);
      
      console.log('响应状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API错误响应:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('获取到模型数量:', data.models?.length || 0);
      return data.models || [];
    } catch (error) {
      console.error('❌ 获取模型列表失败:', error.message);
      throw error;
    }
  }

  async fetchModelDetails(modelName) {
    const url = `${CONFIG.baseUrl}/${modelName}?key=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn(`⚠️  获取模型详情失败 ${modelName}:`, error.message);
      return null;
    }
  }

  convertToModelEntry(modelInfo) {
    const modelId = modelInfo.name.replace('models/', '');
    
    return {
      modelId,
      provider: 'gemini',
      displayName: modelInfo.displayName || modelId,
      description: modelInfo.description || `Google Gemini ${modelId}`,
      limits: {
        temperature: {
          min: 0,
          max: 2,
          default: 1,
          step: 0.1
        },
        maxTokens: {
          min: 1,
          max: modelInfo.outputTokenLimit || 8192,
          default: Math.min(1024, modelInfo.outputTokenLimit || 1024)
        },
        topP: {
          min: 0,
          max: 1,
          default: 0.95,
          step: 0.01
        },
        topK: {
          min: 1,
          max: 40,
          default: 40
        }
      },
      capabilities: {
        supportsStreaming: true,
        supportsImages: modelInfo.supportedGenerationMethods?.includes('generateContent') || false,
        supportsTools: true,
        supportsSystemPrompt: true,
        maxInputTokens: modelInfo.inputTokenLimit || 1000000,
        maxOutputTokens: modelInfo.outputTokenLimit || 8192
      },
      metadata: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        source: 'dynamic',
        tags: ['gemini', 'google'],
        ...(modelInfo.version && { apiVersion: modelInfo.version })
      }
    };
  }

  async createBackup() {
    try {
      const exists = await fs.access(CONFIG.outputPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.readFile(CONFIG.outputPath, 'utf8');
        await fs.writeFile(CONFIG.backupPath, content);
        console.log('📁 已创建备份文件');
      }
    } catch (error) {
      console.warn('⚠️  创建备份失败:', error.message);
    }
  }

  async updateGeminiData() {
    console.log('🚀 开始更新Gemini模型数据...');
    
    try {
      // 创建备份
      await this.createBackup();
      
      // 获取模型列表
      const models = await this.fetchModels();
      console.log(`📋 找到 ${models.length} 个模型`);
      
      // 过滤支持generateContent的模型
      const supportedModels = models.filter(model => 
        model.supportedGenerationMethods?.includes('generateContent')
      );
      console.log(`✅ 其中 ${supportedModels.length} 个支持generateContent`);
      
      // 获取详细信息并转换
      const modelEntries = {};
      let successCount = 0;
      
      for (const model of supportedModels) {
        console.log(`🔄 处理模型: ${model.name}`);
        
        const details = await this.fetchModelDetails(model.name);
        if (details) {
          const entry = this.convertToModelEntry(details);
          modelEntries[entry.modelId] = entry;
          successCount++;
        }
        
        // 避免API限流
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 保存到文件
      const outputDir = path.dirname(CONFIG.outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      
      await fs.writeFile(
        CONFIG.outputPath, 
        JSON.stringify(modelEntries, null, 2),
        'utf8'
      );
      
      console.log(`✅ 成功更新 ${successCount} 个模型的数据`);
      console.log(`📝 数据已保存到: ${CONFIG.outputPath}`);
      
      // 显示统计信息
      this.printStats(modelEntries);
      
    } catch (error) {
      console.error('❌ 更新失败:', error.message);
      
      // 尝试恢复备份
      try {
        const backupExists = await fs.access(CONFIG.backupPath).then(() => true).catch(() => false);
        if (backupExists) {
          const backupContent = await fs.readFile(CONFIG.backupPath, 'utf8');
          await fs.writeFile(CONFIG.outputPath, backupContent);
          console.log('🔄 已从备份恢复');
        }
      } catch (restoreError) {
        console.error('❌ 恢复备份失败:', restoreError.message);
      }
      
      throw error;
    }
  }

  printStats(modelEntries) {
    console.log('\n📊 更新统计:');
    console.log(`总模型数: ${Object.keys(modelEntries).length}`);
    
    const byCapabilities = {};
    Object.values(modelEntries).forEach(entry => {
      const key = entry.capabilities.supportsImages ? '支持图像' : '仅文本';
      byCapabilities[key] = (byCapabilities[key] || 0) + 1;
    });
    
    Object.entries(byCapabilities).forEach(([capability, count]) => {
      console.log(`${capability}: ${count}`);
    });
    
    console.log(`\n🕒 更新时间: ${new Date().toLocaleString()}`);
  }
}

// 主函数
async function main() {
  const updater = new GeminiDataUpdater();
  
  try {
    await updater.updateGeminiData();
    console.log('\n🎉 Gemini数据更新完成!');
  } catch (error) {
    console.error('\n💥 更新过程中发生错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('🚀 启动 Gemini 数据更新脚本...');
  console.log('API Key:', process.env.GEMINI_API_KEY ? '已设置' : '未设置');
  main();
}

module.exports = { GeminiDataUpdater };
