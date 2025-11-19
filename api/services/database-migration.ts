/**
 * 数据库迁移工具
 * 用于确保数据库结构的向后兼容性和数据完整性
 */

import { jsonDatabase } from './json-database.js';

/**
 * 迁移版本号
 */
const CURRENT_VERSION = 2; // 版本2: 添加思维链支持

/**
 * 数据库版本信息
 */
interface DatabaseVersion {
  version: number;
  migrated_at: string;
  description: string;
}

/**
 * 检查并执行必要的数据库迁移
 */
export async function runMigrations(): Promise<void> {
  console.log('[Migration] Checking database version...');
  
  try {
    // 初始化数据库
    await jsonDatabase.init();
    
    // 获取当前版本
    const currentVersion = await getDatabaseVersion();
    
    if (currentVersion >= CURRENT_VERSION) {
      console.log(`[Migration] Database is up to date (v${currentVersion})`);
      return;
    }
    
    console.log(`[Migration] Migrating from v${currentVersion} to v${CURRENT_VERSION}...`);
    
    // 执行迁移
    if (currentVersion < 2) {
      await migrateToV2();
    }
    
    // 更新版本号
    await setDatabaseVersion(CURRENT_VERSION, 'Added thinking chain support');
    
    console.log('[Migration] Migration completed successfully');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw error;
  }
}

/**
 * 获取数据库版本
 */
async function getDatabaseVersion(): Promise<number> {
  try {
    const result = jsonDatabase.from('custom_models').select();
    const versionRecord = result.data?.find((item: any) => item.type === 'db_version');
    return versionRecord?.version || 1;
  } catch (error) {
    console.warn('[Migration] Failed to get version, assuming v1:', error);
    return 1;
  }
}

/**
 * 设置数据库版本
 */
async function setDatabaseVersion(version: number, description: string): Promise<void> {
  try {
    const result = jsonDatabase.from('custom_models').select();
    const versionRecord = result.data?.find((item: any) => item.type === 'db_version');
    
    const versionData: DatabaseVersion = {
      version,
      migrated_at: new Date().toISOString(),
      description
    };
    
    if (versionRecord) {
      // 更新现有版本记录
      await jsonDatabase.from('custom_models').update({
        ...versionData,
        type: 'db_version'
      }).eq('id', versionRecord.id);
    } else {
      // 创建新版本记录
      await jsonDatabase.from('custom_models').insert({
        type: 'db_version',
        ...versionData
      });
    }
  } catch (error) {
    console.error('[Migration] Failed to set version:', error);
    throw error;
  }
}

/**
 * 迁移到版本2：添加思维链支持
 */
async function migrateToV2(): Promise<void> {
  console.log('[Migration] Migrating to v2: Adding thinking chain support...');
  
  try {
    const messagesResult = jsonDatabase.from('messages').select();
    const messages = messagesResult.data || [];
    
    let updatedCount = 0;
    
    // 为所有现有消息添加默认的思维链字段
    for (const message of messages) {
      // 只更新没有思维链字段的消息
      if (message.has_thinking === undefined) {
        await jsonDatabase.from('messages').update({
          has_thinking: false,
          thinking_content: undefined,
          thinking_tokens: undefined,
          reasoning_effort: undefined,
          thought_signature: undefined,
          model_provider: message.provider || undefined,
          output_tokens: undefined
        }).eq('id', message.id);
        
        updatedCount++;
      }
    }
    
    console.log(`[Migration] Updated ${updatedCount} messages with thinking chain fields`);
  } catch (error) {
    console.error('[Migration] Failed to migrate to v2:', error);
    throw error;
  }
}

/**
 * 验证数据库完整性
 */
export async function validateDatabase(): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // 检查消息表
    const messagesResult = jsonDatabase.from('messages').select();
    const messages = messagesResult.data || [];
    
    for (const message of messages) {
      // 验证必需字段
      if (!message.id || !message.conversation_id || !message.content) {
        errors.push(`Message ${message.id} is missing required fields`);
      }
      
      // 验证思维链字段的一致性
      if (message.has_thinking === true) {
        if (!message.thinking_content) {
          warnings.push(`Message ${message.id} has has_thinking=true but no thinking_content`);
        }
      }
      
      // 验证JSON格式
      if (message.thinking_content) {
        try {
          JSON.parse(message.thinking_content);
        } catch {
          errors.push(`Message ${message.id} has invalid thinking_content JSON`);
        }
      }
    }
    
    // 检查对话表
    const conversationsResult = jsonDatabase.from('conversations').select();
    const conversations = conversationsResult.data || [];
    
    for (const conversation of conversations) {
      if (!conversation.id || !conversation.user_id) {
        errors.push(`Conversation ${conversation.id} is missing required fields`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation failed: ${error}`],
      warnings: []
    };
  }
}

/**
 * 清理无效的思维链数据
 */
export async function cleanupInvalidThinkingData(): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let cleaned = 0;
  
  try {
    const messagesResult = jsonDatabase.from('messages').select();
    const messages = messagesResult.data || [];
    
    for (const message of messages) {
      let needsUpdate = false;
      const updates: any = {};
      
      // 清理无效的thinking_content
      if (message.thinking_content) {
        try {
          JSON.parse(message.thinking_content);
        } catch {
          console.warn(`[Cleanup] Invalid thinking_content in message ${message.id}`);
          updates.thinking_content = undefined;
          updates.has_thinking = false;
          needsUpdate = true;
        }
      }
      
      // 修复不一致的has_thinking标志
      if (message.has_thinking === true && !message.thinking_content) {
        updates.has_thinking = false;
        needsUpdate = true;
      }
      
      if (message.has_thinking === false && message.thinking_content) {
        updates.has_thinking = true;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await jsonDatabase.from('messages').update(updates).eq('id', message.id);
        cleaned++;
      }
    }
    
    return { cleaned, errors };
  } catch (error) {
    return {
      cleaned,
      errors: [`Cleanup failed: ${error}`]
    };
  }
}
