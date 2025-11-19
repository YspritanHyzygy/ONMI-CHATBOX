/**
 * JSON文件数据库适配器 - 完全替代Supabase的轻量级本地存储方案
 * 数据存储在本地JSON文件中，支持基本的CRUD操作
 * 
 * 特性:
 * - 基本的锁机制防止并发写入冲突
 * - 改进的错误处理和数据一致性保证
 * - 优化的查询性能和内存使用
 */
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName?: string;
  email?: string;
  avatar?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

interface ModelConfig {
  id: string;
  name: string;
  visible: boolean;
}

interface AIProvider {
  id: string;
  user_id: string;
  provider_name: string;
  api_key?: string;
  base_url?: string;
  available_models: (string | ModelConfig)[];
  default_model?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  provider_used?: string;
  model_used?: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  provider?: string;
  model?: string;
  created_at: string;
  updated_at?: string;
  
  // 思维链相关字段
  has_thinking?: boolean;           // 是否包含思维链
  thinking_content?: string;        // 思维链JSON字符串
  thinking_tokens?: number;         // 思维链token数量
  reasoning_effort?: string;        // 推理努力程度（minimal/low/medium/high）
  thought_signature?: string;       // Gemini思维签名（用于多轮对话）
  model_provider?: string;          // 模型提供商
  output_tokens?: number;           // 输出token数量
}

interface DatabaseSchema {
  users: User[];
  ai_providers: AIProvider[];
  conversations: Conversation[];
  messages: Message[];
  custom_models: any[];
}

/**
 * 简单的锁管理器，用于防止并发写入冲突
 */
class LockManager {
  private locks: Map<string, Promise<void>> = new Map();
  private lockTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly LOCK_TIMEOUT = 10000; // 10秒超时

  /**
   * 获取锁并执行操作
   */
  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // 等待现有锁释放
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    // 创建新锁 - 使用一个简单的Promise来表示锁
    let lockResolve: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      lockResolve = resolve;
    });
    
    this.locks.set(key, lockPromise);

    // 设置超时自动释放
    const timeout = setTimeout(() => {
      console.warn(`Lock timeout for key: ${key}`);
      lockResolve();
      this.releaseLock(key);
    }, this.LOCK_TIMEOUT);
    
    this.lockTimeouts.set(key, timeout);

    try {
      // 执行操作
      const result = await operation();
      lockResolve();
      return result;
    } finally {
      // 释放锁
      this.releaseLock(key);
    }
  }

  /**
   * 释放锁
   */
  private releaseLock(key: string): void {
    const timeout = this.lockTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.lockTimeouts.delete(key);
    }
    this.locks.delete(key);
  }

  /**
   * 清理所有锁（用于测试或重置）
   */
  clearAll(): void {
    for (const timeout of this.lockTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.locks.clear();
    this.lockTimeouts.clear();
  }
}

/**
 * 数据库错误类型
 */
class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class JSONDatabase {
  private dbPath: string;
  private data: DatabaseSchema;
  private lockManager: LockManager;
  private dataCache: DatabaseSchema | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 1000; // 1秒缓存

  constructor() {
    // 数据文件存储在项目根目录的data文件夹中
    this.dbPath = path.join(process.cwd(), 'data', 'database.json');
    this.data = {
      users: [],
      ai_providers: [],
      conversations: [],
      messages: [],
      custom_models: []
    };
    this.lockManager = new LockManager();
  }

  /**
   * 初始化数据库 - 创建文件夹和初始数据
   */
  async init(): Promise<void> {
    return this.lockManager.withLock('init', async () => {
      try {
        const dataDir = path.dirname(this.dbPath);
        
        // 创建data目录
        try {
          await fs.access(dataDir);
        } catch {
          await fs.mkdir(dataDir, { recursive: true });
        }

        // 检查数据库文件是否存在
        try {
          await fs.access(this.dbPath);
          await this.loadData();
        } catch {
          // 文件不存在，创建初始数据
          await this.createInitialData();
          await this.saveData();
        }
      } catch (error) {
        console.error('Database initialization failed:', error);
        throw new DatabaseError(
          'Failed to initialize database',
          'INIT_ERROR',
          error
        );
      }
    });
  }

  /**
   * 创建初始演示数据
   */
  private async createInitialData(): Promise<void> {
    const now = new Date().toISOString();
    const demoUserId = 'demo-user-001';
    const demoPasswordHash = await bcrypt.hash('demo123', 10);

    // 创建演示用户
    this.data.users.push({
      id: demoUserId,
      username: 'demo_user',
      passwordHash: demoPasswordHash,
      displayName: '演示用户',
      email: 'demo@example.com',
      created_at: now,
      updated_at: now,
      last_login: now
    });

    // 不再创建默认的欢迎对话，保持干净的初始状态
  }

  /**
   * 从文件加载数据（带缓存）
   */
  private async loadData(): Promise<void> {
    try {
      // 检查缓存是否有效
      const now = Date.now();
      if (this.dataCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
        this.data = this.dataCache;
        return;
      }

      const fileContent = await fs.readFile(this.dbPath, 'utf-8');
      const parsedData = JSON.parse(fileContent);
      
      // 验证数据结构
      if (!this.validateDatabaseSchema(parsedData)) {
        throw new DatabaseError(
          'Invalid database schema',
          'SCHEMA_ERROR',
          { path: this.dbPath }
        );
      }
      
      this.data = parsedData;
      this.dataCache = { ...parsedData };
      this.cacheTimestamp = now;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      console.error('Failed to load database:', error);
      throw new DatabaseError(
        'Failed to load database file',
        'LOAD_ERROR',
        error
      );
    }
  }

  /**
   * 验证数据库结构
   */
  private validateDatabaseSchema(data: any): data is DatabaseSchema {
    return (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.users) &&
      Array.isArray(data.ai_providers) &&
      Array.isArray(data.conversations) &&
      Array.isArray(data.messages) &&
      Array.isArray(data.custom_models)
    );
  }

  /**
   * 保存数据到文件（带备份和原子性保证）
   */
  private async saveData(): Promise<void> {
    return this.lockManager.withLock('save', async () => {
      try {
        const tempPath = `${this.dbPath}.tmp`;
        const backupPath = `${this.dbPath}.backup.${Date.now()}`;
        
        // 写入临时文件
        await fs.writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
        
        // 验证临时文件
        const tempContent = await fs.readFile(tempPath, 'utf-8');
        const parsedTemp = JSON.parse(tempContent);
        if (!this.validateDatabaseSchema(parsedTemp)) {
          throw new DatabaseError(
            'Data validation failed before save',
            'VALIDATION_ERROR'
          );
        }
        
        // 备份现有文件（如果存在）
        try {
          await fs.access(this.dbPath);
          await fs.copyFile(this.dbPath, backupPath);
          
          // 清理旧备份（保留最近5个）
          await this.cleanupOldBackups();
        } catch {
          // 文件不存在，跳过备份
        }
        
        // 原子性替换
        await fs.rename(tempPath, this.dbPath);
        
        // 更新缓存
        this.dataCache = { ...this.data };
        this.cacheTimestamp = Date.now();
      } catch (error) {
        if (error instanceof DatabaseError) {
          throw error;
        }
        console.error('Failed to save database:', error);
        throw new DatabaseError(
          'Failed to save database file',
          'SAVE_ERROR',
          error
        );
      }
    });
  }

  /**
   * 清理旧备份文件
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const dataDir = path.dirname(this.dbPath);
      const files = await fs.readdir(dataDir);
      const backupFiles = files
        .filter(f => f.startsWith('database.json.backup.'))
        .sort()
        .reverse();
      
      // 保留最近5个备份
      const filesToDelete = backupFiles.slice(5);
      for (const file of filesToDelete) {
        await fs.unlink(path.join(dataDir, file));
      }
    } catch (error) {
      // 清理失败不影响主流程
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * 公开的保存数据方法 - 用于手动触发数据保存
   */
  async save(): Promise<void> {
    await this.saveData();
  }

  /**
   * 清理所有对话和消息数据 - 保留用户和AI配置
   */
  async clearAllConversations(): Promise<void> {
    return this.lockManager.withLock('clear', async () => {
      try {
        this.data.conversations = [];
        this.data.messages = [];
        await this.saveData();
        console.log('已清理所有对话和消息数据');
      } catch (error) {
        throw new DatabaseError(
          'Failed to clear conversations',
          'CLEAR_ERROR',
          error
        );
      }
    });
  }

  // ============= 通用查询方法 =============

  /**
   * 模拟Supabase的from().select()查询
   */
  from(table: keyof DatabaseSchema) {
    return {
      select: (_fields: string = '*') => {
        try {
          // 返回数据的浅拷贝，避免外部修改影响内部数据
          const data = this.data[table].map(item => ({ ...item }));
          return {
            data,
            error: null
          };
        } catch (error) {
          return {
            data: null,
            error: { message: 'Failed to select data', details: error }
          };
        }
      },
      insert: async (record: any) => {
        return this.lockManager.withLock(`insert-${table}`, async () => {
          try {
            // 验证记录
            if (!record || typeof record !== 'object') {
              throw new DatabaseError(
                'Invalid record data',
                'INVALID_DATA'
              );
            }

            const now = new Date().toISOString();
            const newRecord = {
              id: uuidv4(),
              ...record,
              created_at: now,
              updated_at: now
            };
            
            (this.data[table] as any[]).push(newRecord);
            await this.saveData();
            
            return {
              data: newRecord,
              error: null
            };
          } catch (error) {
            console.error(`Failed to insert into ${table}:`, error);
            return {
              data: null,
              error: {
                message: error instanceof DatabaseError ? error.message : 'Failed to insert record',
                code: error instanceof DatabaseError ? error.code : 'INSERT_ERROR'
              }
            };
          }
        });
      },
      update: (updates: any) => {
        return {
          eq: async (field: string, value: any) => {
            return this.lockManager.withLock(`update-${table}`, async () => {
              try {
                // 验证更新数据
                if (!updates || typeof updates !== 'object') {
                  throw new DatabaseError(
                    'Invalid update data',
                    'INVALID_DATA'
                  );
                }

                const items = this.data[table] as any[];
                const index = items.findIndex(item => item[field] === value);
                
                if (index !== -1) {
                  items[index] = {
                    ...items[index],
                    ...updates,
                    updated_at: new Date().toISOString()
                  };
                  await this.saveData();
                  return { data: items[index], error: null };
                }
                
                return {
                  data: null,
                  error: {
                    message: 'Record not found',
                    code: 'NOT_FOUND'
                  }
                };
              } catch (error) {
                console.error(`Failed to update ${table}:`, error);
                return {
                  data: null,
                  error: {
                    message: error instanceof DatabaseError ? error.message : 'Failed to update record',
                    code: error instanceof DatabaseError ? error.code : 'UPDATE_ERROR'
                  }
                };
              }
            });
          }
        };
      },
      delete: () => {
        return {
          eq: async (field: string, value: any) => {
            return this.lockManager.withLock(`delete-${table}`, async () => {
              try {
                const items = this.data[table] as any[];
                const index = items.findIndex(item => item[field] === value);
                
                if (index !== -1) {
                  const deleted = items.splice(index, 1)[0];
                  await this.saveData();
                  return { data: deleted, error: null };
                }
                
                return {
                  data: null,
                  error: {
                    message: 'Record not found',
                    code: 'NOT_FOUND'
                  }
                };
              } catch (error) {
                console.error(`Failed to delete from ${table}:`, error);
                return {
                  data: null,
                  error: {
                    message: error instanceof DatabaseError ? error.message : 'Failed to delete record',
                    code: error instanceof DatabaseError ? error.code : 'DELETE_ERROR'
                  }
                };
              }
            });
          }
        };
      }
    };
  }

  // ============= 特定查询方法 =============

  /**
   * 根据用户ID获取对话列表（优化版本）
   */
  async getConversationsByUserId(userId: string) {
    try {
      if (!userId) {
        throw new DatabaseError('User ID is required', 'INVALID_PARAM');
      }

      // 使用索引优化查询（如果数据量大，可以考虑建立索引）
      const conversations = this.data.conversations
        .filter(conv => conv.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      return { data: conversations, error: null };
    } catch (error) {
      console.error('Failed to get conversations:', error);
      return {
        data: null,
        error: {
          message: error instanceof DatabaseError ? error.message : 'Failed to get conversations',
          code: error instanceof DatabaseError ? error.code : 'QUERY_ERROR'
        }
      };
    }
  }

  /**
   * 根据对话ID获取消息列表（优化版本，支持分页）
   */
  async getMessagesByConversationId(conversationId: string, options?: { limit?: number; offset?: number }) {
    try {
      if (!conversationId) {
        throw new DatabaseError('Conversation ID is required', 'INVALID_PARAM');
      }

      let messages = this.data.messages
        .filter(msg => msg.conversation_id === conversationId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      // 支持分页以优化大对话的性能
      if (options?.offset !== undefined) {
        messages = messages.slice(options.offset);
      }
      if (options?.limit !== undefined) {
        messages = messages.slice(0, options.limit);
      }
      
      return { data: messages, error: null };
    } catch (error) {
      console.error('Failed to get messages:', error);
      return {
        data: null,
        error: {
          message: error instanceof DatabaseError ? error.message : 'Failed to get messages',
          code: error instanceof DatabaseError ? error.code : 'QUERY_ERROR'
        }
      };
    }
  }

  /**
   * 根据用户ID和提供商名称获取AI配置
   */
  async getAIProviderConfig(userId: string, providerName: string) {
    try {
      if (!userId || !providerName) {
        throw new DatabaseError('User ID and provider name are required', 'INVALID_PARAM');
      }

      const provider = this.data.ai_providers.find(
        p => p.user_id === userId && p.provider_name === providerName
      );
      
      return { data: provider || null, error: null };
    } catch (error) {
      console.error('Failed to get AI provider config:', error);
      return {
        data: null,
        error: {
          message: error instanceof DatabaseError ? error.message : 'Failed to get provider config',
          code: error instanceof DatabaseError ? error.code : 'QUERY_ERROR'
        }
      };
    }
  }

  /**
   * 获取用户的所有AI提供商配置
   */
  async getAIProvidersByUserId(userId: string) {
    try {
      if (!userId) {
        throw new DatabaseError('User ID is required', 'INVALID_PARAM');
      }

      const providers = this.data.ai_providers.filter(p => p.user_id === userId);
      return { data: providers, error: null };
    } catch (error) {
      console.error('Failed to get AI providers:', error);
      return {
        data: null,
        error: {
          message: error instanceof DatabaseError ? error.message : 'Failed to get providers',
          code: error instanceof DatabaseError ? error.code : 'QUERY_ERROR'
        }
      };
    }
  }

  /**
   * 更新或创建 AI 提供商配置（带锁保护）
   */
  async updateAIProviderConfig(userId: string, providerName: string, configData: any) {
    return this.lockManager.withLock(`provider-${userId}-${providerName}`, async () => {
      try {
        if (!userId || !providerName) {
          throw new DatabaseError('User ID and provider name are required', 'INVALID_PARAM');
        }

        if (!configData || typeof configData !== 'object') {
          throw new DatabaseError('Invalid config data', 'INVALID_DATA');
        }

        const existingIndex = this.data.ai_providers.findIndex(
          p => p.user_id === userId && p.provider_name === providerName
        );
        
        const now = new Date().toISOString();
        
        if (existingIndex !== -1) {
          // 更新现有配置
          this.data.ai_providers[existingIndex] = {
            ...this.data.ai_providers[existingIndex],
            ...configData,
            updated_at: now
          };
          await this.saveData();
          return { data: this.data.ai_providers[existingIndex], error: null };
        } else {
          // 创建新配置
          const newConfig = {
            id: uuidv4(),
            ...configData,
            created_at: now,
            updated_at: now
          };
          this.data.ai_providers.push(newConfig);
          await this.saveData();
          return { data: newConfig, error: null };
        }
      } catch (error) {
        console.error('Failed to update AI provider config:', error);
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to update config',
            code: error instanceof DatabaseError ? error.code : 'UPDATE_ERROR'
          }
        };
      }
    });
  }

  // ============= 用户认证方法 =============

  /**
   * 通过用户名查找用户
   */
  async findUserByUsername(username: string) {
    const user = this.data.users.find(u => u.username === username);
    if (user) {
      // 返回时移除密码哈希
      const { passwordHash: _, ...userWithoutPassword } = user;
      return { data: userWithoutPassword, error: null };
    }
    return { data: null, error: null };
  }

  /**
   * 通过用户ID查找用户
   */
  async findUserById(userId: string) {
    const user = this.data.users.find(u => u.id === userId);
    if (user) {
      // 返回时移除密码哈希
      const { passwordHash: _, ...userWithoutPassword } = user;
      return { data: userWithoutPassword, error: null };
    }
    return { data: null, error: null };
  }

  /**
   * 验证用户密码
   */
  async validatePassword(username: string, password: string) {
    const user = this.data.users.find(u => u.username === username);
    if (!user) {
      return { data: false, error: { message: '用户不存在' } };
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    return { data: isValid, error: null };
  }

  /**
   * 更改用户密码（带锁保护）
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    return this.lockManager.withLock(`password-${userId}`, async () => {
      try {
        if (!userId || !currentPassword || !newPassword) {
          throw new DatabaseError('All password fields are required', 'INVALID_PARAM');
        }

        const userIndex = this.data.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
          return {
            data: null,
            error: {
              message: '用户不存在',
              code: 'USER_NOT_FOUND'
            }
          };
        }

        const user = this.data.users[userIndex];
        
        // 验证当前密码
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isCurrentPasswordValid) {
          return {
            data: null,
            error: {
              message: '当前密码不正确',
              code: 'INVALID_PASSWORD'
            }
          };
        }

        // 加密新密码
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        
        // 更新用户数据
        this.data.users[userIndex] = {
          ...user,
          passwordHash: newPasswordHash,
          updated_at: new Date().toISOString()
        };
        
        await this.saveData();
        
        // 返回时移除密码哈希
        const { passwordHash: _, ...userWithoutPassword } = this.data.users[userIndex];
        return { data: userWithoutPassword, error: null };
      } catch (error) {
        console.error('Failed to change password:', error);
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to change password',
            code: error instanceof DatabaseError ? error.code : 'UPDATE_ERROR'
          }
        };
      }
    });
  }

  /**
   * 创建新用户（带锁保护）
   */
  async createUser(userData: { username: string; password: string; displayName?: string; email?: string }) {
    return this.lockManager.withLock('create-user', async () => {
      try {
        // 验证输入
        if (!userData.username || !userData.password) {
          throw new DatabaseError('Username and password are required', 'INVALID_PARAM');
        }

        // 检查用户名是否已存在
        const existingUser = this.data.users.find(u => u.username === userData.username);
        if (existingUser) {
          return {
            data: null,
            error: {
              message: '用户名已存在',
              code: 'USER_EXISTS'
            }
          };
        }

        // 加密密码
        const passwordHash = await bcrypt.hash(userData.password, 10);

        const now = new Date().toISOString();
        const newUser = {
          id: uuidv4(),
          username: userData.username,
          passwordHash,
          displayName: userData.displayName || userData.username,
          email: userData.email,
          created_at: now,
          updated_at: now,
          last_login: now
        };

        this.data.users.push(newUser);
        await this.saveData();
        
        // 返回时移除密码哈希
        const { passwordHash: _, ...userWithoutPassword } = newUser;
        return { data: userWithoutPassword, error: null };
      } catch (error) {
        console.error('Failed to create user:', error);
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to create user',
            code: error instanceof DatabaseError ? error.code : 'CREATE_ERROR'
          }
        };
      }
    });
  }

  /**
   * 更新用户最后登录时间（带锁保护）
   */
  async updateLastLogin(userId: string) {
    return this.lockManager.withLock(`login-${userId}`, async () => {
      try {
        if (!userId) {
          throw new DatabaseError('User ID is required', 'INVALID_PARAM');
        }

        const userIndex = this.data.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
          this.data.users[userIndex].last_login = new Date().toISOString();
          this.data.users[userIndex].updated_at = new Date().toISOString();
          await this.saveData();
          return { data: this.data.users[userIndex], error: null };
        }
        return {
          data: null,
          error: {
            message: '用户不存在',
            code: 'USER_NOT_FOUND'
          }
        };
      } catch (error) {
        console.error('Failed to update last login:', error);
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to update last login',
            code: error instanceof DatabaseError ? error.code : 'UPDATE_ERROR'
          }
        };
      }
    });
  }

  // ============= 思维链相关方法 =============

  /**
   * 序列化思维链内容为JSON字符串
   */
  serializeThinkingContent(thinking: any): string | undefined {
    if (!thinking) return undefined;
    
    try {
      return JSON.stringify(thinking);
    } catch (error) {
      console.error('Failed to serialize thinking content:', error);
      return undefined;
    }
  }

  /**
   * 反序列化思维链内容
   */
  deserializeThinkingContent(thinkingJson: string | undefined): any | undefined {
    if (!thinkingJson) return undefined;
    
    try {
      return JSON.parse(thinkingJson);
    } catch (error) {
      console.error('Failed to deserialize thinking content:', error);
      return undefined;
    }
  }

  /**
   * 获取包含思维链的消息（用于分析和统计）
   */
  async getMessagesWithThinking(conversationId?: string) {
    try {
      let messages = this.data.messages.filter(msg => msg.has_thinking === true);
      
      if (conversationId) {
        messages = messages.filter(msg => msg.conversation_id === conversationId);
      }
      
      // 反序列化思维链内容
      const messagesWithParsedThinking = messages.map(msg => ({
        ...msg,
        thinking_content_parsed: this.deserializeThinkingContent(msg.thinking_content)
      }));
      
      return { data: messagesWithParsedThinking, error: null };
    } catch (error) {
      console.error('Failed to get messages with thinking:', error);
      return {
        data: null,
        error: {
          message: error instanceof DatabaseError ? error.message : 'Failed to get messages',
          code: error instanceof DatabaseError ? error.code : 'QUERY_ERROR'
        }
      };
    }
  }

  /**
   * 获取思维链统计信息
   */
  getThinkingStats() {
    const messagesWithThinking = this.data.messages.filter(msg => msg.has_thinking === true);
    const totalThinkingTokens = messagesWithThinking.reduce(
      (sum, msg) => sum + (msg.thinking_tokens || 0), 
      0
    );
    
    // 按提供商统计
    const byProvider: Record<string, { count: number; tokens: number }> = {};
    messagesWithThinking.forEach(msg => {
      const provider = msg.model_provider || msg.provider || 'unknown';
      if (!byProvider[provider]) {
        byProvider[provider] = { count: 0, tokens: 0 };
      }
      byProvider[provider].count++;
      byProvider[provider].tokens += msg.thinking_tokens || 0;
    });
    
    return {
      totalMessages: messagesWithThinking.length,
      totalThinkingTokens,
      byProvider,
      averageTokensPerMessage: messagesWithThinking.length > 0 
        ? Math.round(totalThinkingTokens / messagesWithThinking.length)
        : 0
    };
  }

  /**
   * 获取数据库统计信息（用于监控和调试）
   */
  getStats() {
    return {
      users: this.data.users.length,
      ai_providers: this.data.ai_providers.length,
      conversations: this.data.conversations.length,
      messages: this.data.messages.length,
      custom_models: this.data.custom_models.length,
      messagesWithThinking: this.data.messages.filter(m => m.has_thinking).length,
      cacheAge: Date.now() - this.cacheTimestamp,
      dbPath: this.dbPath
    };
  }

  /**
   * 清理锁管理器（用于测试或重置）
   */
  clearLocks() {
    this.lockManager.clearAll();
  }

  /**
   * 使缓存失效
   */
  invalidateCache() {
    this.dataCache = null;
    this.cacheTimestamp = 0;
  }
}

// 导出单例实例
export const jsonDatabase = new JSONDatabase();

// 导出创建客户端的函数，保持与Supabase相同的接口
export function createClient(_url?: string, _key?: string) {
  return jsonDatabase;
}