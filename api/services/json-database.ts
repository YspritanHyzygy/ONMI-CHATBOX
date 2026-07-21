/**
 * JSON 文件数据库适配器 - ONMI 的轻量级本地存储实现
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
import { sanitizeErrorMessage } from './error-utils.js';

export const CURRENT_DATABASE_VERSION = 3;

export interface User {
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

export interface AIProvider {
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
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  provider_used?: string;
  model_used?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
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

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
}

export interface MigrationRecord {
  version: number;
  migrated_at: string;
  description: string;
}

export interface DatabaseSchema {
  users: User[];
  ai_providers: AIProvider[];
  conversations: Conversation[];
  messages: Message[];
  custom_models: any[];
  sessions: Session[];
  db_version: number;
  migrations: MigrationRecord[];
}

type ImportMergeMode = 'merge' | 'replace';

interface ImportStats {
  conversations: number;
  messages: number;
  aiProviders: number;
  skipped: number;
  errors: number;
}

export interface ImportPayload {
  version?: string;
  conversations?: Partial<Conversation>[];
  messages?: Partial<Message>[];
  aiProviders?: Partial<AIProvider>[];
  metadata?: {
    credentialsIncluded?: boolean;
    [key: string]: unknown;
  };
}

export interface PrepareChatTurnInput {
  userId: string;
  conversationId?: string;
  title?: string;
  message: {
    content: string;
    role: 'user';
    provider?: string;
    model?: string;
  };
}

export interface DatabaseHealthReport {
  dbVersion: number;
  currentVersion: number;
  pendingMigrations: number[];
  migrationHistory: MigrationRecord[];
  counts: {
    users: number;
    conversations: number;
    messages: number;
    aiProviders: number;
  };
  integrity: {
    orphanMessages: number;
    orphanConversations: number;
    duplicateUsernames: number;
    duplicateIds: number;
  };
  latestBackup: {
    filename: string;
    createdAt: string;
    sizeBytes: number;
  } | null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function safeErrorMessage(error: unknown): string {
  return sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
}

function cloneDatabase(data: DatabaseSchema): DatabaseSchema {
  return JSON.parse(JSON.stringify(data)) as DatabaseSchema;
}

function getLegacyDatabaseVersion(customModels: unknown[]): number {
  const record = customModels.find((item) => {
    return item &&
      typeof item === 'object' &&
      (item as { type?: unknown }).type === 'db_version';
  }) as { version?: unknown } | undefined;
  return typeof record?.version === 'number' && Number.isInteger(record.version)
    ? record.version
    : 1;
}

const CREDENTIAL_KEY_PATTERN = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|password|authorization)$/i;
const SUPPORTED_IMPORT_VERSIONS = new Set(['1.0', '2.0']);

function stripCredentials(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCredentials);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CREDENTIAL_KEY_PATTERN.test(key))
      .map(([key, nestedValue]) => [key, stripCredentials(nestedValue)])
  );
}

function containsCredentials(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsCredentials);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (CREDENTIAL_KEY_PATTERN.test(key)) {
      return typeof nestedValue === 'string' && nestedValue.trim().length > 0;
    }
    return containsCredentials(nestedValue);
  });
}

function countDuplicateValues(values: string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return duplicates.size;
}

function sanitizeProviderConfig(configData: Record<string, unknown>): Partial<AIProvider> {
  const allowedFields = [
    'api_key',
    'base_url',
    'available_models',
    'default_model',
    'is_active',
    'use_responses_api'
  ] as const;
  return Object.fromEntries(
    allowedFields
      .filter((field) => Object.prototype.hasOwnProperty.call(configData, field))
      .map((field) => [field, configData[field]])
  ) as Partial<AIProvider>;
}

/**
 * 简单的锁管理器，用于防止并发写入冲突
 */
class LockManager {
  private locks: Map<string, Promise<void>> = new Map();

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

    try {
      // 执行操作
      const result = await operation();
      return result;
    } finally {
      // 确保锁的 Promise 被 resolve，避免等待者永远挂起
      lockResolve();
      // 释放锁
      this.releaseLock(key);
    }
  }

  /**
   * 释放锁
   */
  private releaseLock(key: string): void {
    this.locks.delete(key);
  }

  /**
   * 清理所有锁（用于测试或重置）
   */
  clearAll(): void {
    this.locks.clear();
  }
}

/**
 * 数据库错误类型
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class JSONDatabase {
  private dbPath: string;
  private data: DatabaseSchema;
  private lockManager: LockManager;
  private dataCache: DatabaseSchema | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 1000; // 1秒缓存

  constructor(dbPath?: string) {
    // Resolve the singleton's environment-based path at init time. app.ts
    // loads .env after ESM dependencies are instantiated, but before database
    // initialization; resolving here would otherwise ignore a path from .env.
    this.dbPath = dbPath || '';
    this.data = {
      users: [],
      ai_providers: [],
      conversations: [],
      messages: [],
      custom_models: [],
      sessions: [],
      db_version: CURRENT_DATABASE_VERSION,
      migrations: []
    };
    this.lockManager = new LockManager();
  }

  /**
   * 初始化数据库 - 创建文件夹和初始数据
   */
  async init(): Promise<void> {
    return this.lockManager.withLock('init', async () => {
      try {
        if (!this.dbPath) {
          this.dbPath = process.env.GEMINI_VIDEO_WEBUI_DB_PATH
            || path.join(process.cwd(), 'data', 'database.json');
        }
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
        } catch (error) {
          if (!isNodeError(error) || error.code !== 'ENOENT') {
            throw error;
          }

          // 恢复流程若恰好在两次 rename 之间崩溃，会留下 .restore.tmp 而
          // dbPath 缺失——此时必须先完成换位，绝不能新建空库覆盖用户数据。
          const stagingPath = `${this.dbPath}.restore.tmp`;
          const stagingExists = await fs.access(stagingPath).then(() => true).catch(() => false);
          if (stagingExists) {
            await fs.rename(stagingPath, this.dbPath);
            console.warn('[JSONDatabase] Completed an interrupted backup restore from .restore.tmp');
            await this.loadData();
            return;
          }

          await this.createInitialData();
          await this.saveData();
          return;
        }

        // Existing files must load successfully. On corruption, attempt an
        // automatic restore from the newest valid backup; the corrupt file is
        // preserved as *.corrupt.<timestamp> so nothing is ever destroyed.
        try {
          await this.loadData();
        } catch (loadError) {
          const restored = await this.tryRestoreFromBackup();
          if (!restored) throw loadError;
        }
      } catch (error) {
        console.error('Database initialization failed:', safeErrorMessage(error));
        throw new DatabaseError(
          'Failed to initialize database',
          'INIT_ERROR',
          error
        );
      }
    });
  }

  /**
   * 数据库文件损坏时，从最新的有效备份自动恢复。
   * 损坏文件保留为 *.corrupt.<timestamp>，绝不销毁；无可用备份时返回 false，
   * 由调用方按原有"启动失败保护"路径抛出。
   */
  private async tryRestoreFromBackup(): Promise<boolean> {
    try {
      const dataDir = path.dirname(this.dbPath);
      const backupPrefix = `${path.basename(this.dbPath)}.backup.`;
      const files = await fs.readdir(dataDir);
      const candidates = await Promise.all(
        files
          .filter((name) => name.startsWith(backupPrefix))
          .map(async (name) => {
            const fullPath = path.join(dataDir, name);
            const stats = await fs.stat(fullPath);
            return { fullPath, mtimeMs: stats.mtimeMs };
          })
      );
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const candidate of candidates) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await fs.readFile(candidate.fullPath, 'utf-8'));
        } catch {
          continue;
        }
        if (!this.validateDatabaseSchema(parsed)) continue;

        // 顺序保证任何时刻 dbPath 都存在文件：先把备份内容写到临时文件，
        // 损坏文件挪走后立即把临时文件换位进来。若中途崩溃，dbPath 上要么
        // 还是损坏文件（下次启动重走恢复），要么已是恢复后的文件——绝不会
        // 出现 ENOENT 导致 init() 静默新建空库。
        const corruptPath = `${this.dbPath}.corrupt.${Date.now()}`;
        const stagingPath = `${this.dbPath}.restore.tmp`;
        await fs.copyFile(candidate.fullPath, stagingPath);
        await fs.rename(this.dbPath, corruptPath);
        await fs.rename(stagingPath, this.dbPath);
        this.dataCache = null;
        await this.loadData();
        console.warn(
          `[JSONDatabase] Database file was corrupt and has been restored from backup ${path.basename(candidate.fullPath)}. ` +
          `The corrupt file is preserved at ${path.basename(corruptPath)}.`
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error('[JSONDatabase] Backup restore attempt failed:', safeErrorMessage(error));
      return false;
    }
  }

  /**
   * 创建空的当前版本数据库
   */
  private async createInitialData(): Promise<void> {
    this.data = {
      users: [],
      ai_providers: [],
      conversations: [],
      messages: [],
      custom_models: [],
      sessions: [],
      db_version: CURRENT_DATABASE_VERSION,
      migrations: []
    };
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
      
      const legacyVersion = getLegacyDatabaseVersion(parsedData.custom_models);
      this.data = {
        ...parsedData,
        sessions: Array.isArray(parsedData.sessions) ? parsedData.sessions : [],
        db_version: Number.isInteger(parsedData.db_version)
          ? parsedData.db_version
          : legacyVersion,
        migrations: Array.isArray(parsedData.migrations) ? parsedData.migrations : []
      };
      this.dataCache = cloneDatabase(this.data);
      this.cacheTimestamp = now;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      console.error(
        'Failed to load database:',
        error instanceof SyntaxError ? 'Database file contains invalid JSON' : safeErrorMessage(error)
      );
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
  private validateDatabaseSchema(data: unknown): data is DatabaseSchema {
    const candidate = data as Partial<DatabaseSchema> | null;
    const sessionsValid = candidate?.sessions === undefined || (
      Array.isArray(candidate.sessions) &&
      candidate.sessions.every((session) => (
        session &&
        typeof session.id === 'string' &&
        typeof session.user_id === 'string' &&
        typeof session.token_hash === 'string' &&
        /^[a-f0-9]{64}$/i.test(session.token_hash) &&
        Number.isFinite(Date.parse(session.created_at)) &&
        Number.isFinite(Date.parse(session.expires_at))
      ))
    );
    const migrationsValid = candidate?.migrations === undefined || (
      Array.isArray(candidate.migrations) &&
      candidate.migrations.every((migration) => (
        migration &&
        Number.isInteger(migration.version) &&
        typeof migration.description === 'string' &&
        Number.isFinite(Date.parse(migration.migrated_at))
      ))
    );
    return (
      candidate !== null &&
      typeof candidate === 'object' &&
      Array.isArray(candidate.users) &&
      Array.isArray(candidate.ai_providers) &&
      Array.isArray(candidate.conversations) &&
      Array.isArray(candidate.messages) &&
      Array.isArray(candidate.custom_models) &&
      sessionsValid &&
      (candidate.db_version === undefined || (
        Number.isInteger(candidate.db_version) && candidate.db_version > 0
      )) &&
      migrationsValid
    );
  }

  /**
   * 保存数据到文件（带备份和原子性保证）
   */
  private async saveData(): Promise<void> {
    return this.lockManager.withLock('save', async () => {
      try {
        const tempPath = `${this.dbPath}.tmp`;
        const backupPath = this.getBackupPath('write');
        
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
          await fs.copyFile(this.dbPath, backupPath);
          await this.cleanupOldBackups();
        } catch (error) {
          if (!isNodeError(error) || error.code !== 'ENOENT') {
            throw error;
          }
        }
        
        // 原子性替换
        await fs.rename(tempPath, this.dbPath);
        
        // 更新缓存
        this.dataCache = cloneDatabase(this.data);
        this.cacheTimestamp = Date.now();
      } catch (error) {
        if (error instanceof DatabaseError) {
          throw error;
        }
        console.error('Failed to save database:', safeErrorMessage(error));
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
      const backupPrefix = `${path.basename(this.dbPath)}.backup.`;
      const backupFiles = files
        .filter(f => f.startsWith(backupPrefix))
        .sort()
        .reverse();

      // Keep migration snapshots in a separate retention bucket so routine
      // chat writes cannot immediately rotate away the only pre-migration
      // recovery point.
      const migrationBackups = backupFiles.filter((file) => file.includes('.migration-v'));
      const routineBackups = backupFiles.filter((file) => !file.includes('.migration-v'));
      const filesToDelete = [
        ...routineBackups.slice(5),
        ...migrationBackups.slice(3)
      ];
      for (const file of filesToDelete) {
        await fs.unlink(path.join(dataDir, file));
      }
    } catch (error) {
      // 清理失败不影响主流程
      console.warn('Failed to cleanup old backups:', safeErrorMessage(error));
    }
  }

  private getBackupPath(label: string): string {
    const safeLabel = label.replace(/[^a-z0-9-]/gi, '-');
    return `${this.dbPath}.backup.${Date.now()}.${safeLabel}`;
  }

  async createBackup(label = 'manual'): Promise<string> {
    const backupPath = this.getBackupPath(label);
    await fs.copyFile(this.dbPath, backupPath);
    await this.cleanupOldBackups();
    return backupPath;
  }

  /**
   * 公开的保存数据方法 - 用于手动触发数据保存
   */
  async save(): Promise<void> {
    await this.lockManager.withLock('database-write', () => this.saveData());
  }

  getDatabaseVersion(): number {
    return this.data.db_version;
  }

  getMigrationHistory(): MigrationRecord[] {
    return this.data.migrations.map((migration) => ({ ...migration }));
  }

  async applyMigration(
    version: number,
    description: string,
    migrate: (draft: DatabaseSchema) => void
  ): Promise<boolean> {
    return this.lockManager.withLock('database-write', async () => {
      if (this.data.db_version >= version) {
        return false;
      }

      await this.createBackup(`migration-v${version}`);
      const original = cloneDatabase(this.data);

      try {
        const draft = cloneDatabase(this.data);
        migrate(draft);
        draft.db_version = version;
        draft.migrations.push({
          version,
          migrated_at: new Date().toISOString(),
          description
        });
        this.data = draft;
        await this.saveData();
        return true;
      } catch (error) {
        this.restoreData(original);
        throw error;
      }
    });
  }

  async createPersistentSession(
    userId: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<Session> {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        const userExists = this.data.users.some((user) => user.id === userId);
        if (!userExists) {
          throw new DatabaseError('User not found', 'NOT_FOUND');
        }
        if (!/^[a-f0-9]{64}$/i.test(tokenHash)) {
          throw new DatabaseError('Invalid session token hash', 'INVALID_PARAM');
        }
        if (!Number.isFinite(Date.parse(expiresAt))) {
          throw new DatabaseError('Invalid session expiry', 'INVALID_PARAM');
        }

        const now = new Date().toISOString();
        this.data.sessions = this.data.sessions.filter(
          (session) => Date.parse(session.expires_at) > Date.now()
        );

        if (this.data.sessions.some((session) => session.token_hash === tokenHash)) {
          throw new DatabaseError('Session token already exists', 'DUPLICATE_ID');
        }

        const session: Session = {
          id: this.generateUniqueId(this.data.sessions),
          user_id: userId,
          token_hash: tokenHash,
          created_at: now,
          expires_at: expiresAt
        };
        this.data.sessions.push(session);
        await this.saveData();
        return { ...session };
      } catch (error) {
        this.restoreData(original);
        throw error;
      }
    });
  }

  async findValidSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = this.data.sessions.find((item) => item.token_hash === tokenHash);
    if (!session) {
      return null;
    }

    if (Date.parse(session.expires_at) <= Date.now()) {
      await this.deleteSessionById(session.id);
      return null;
    }

    const userExists = this.data.users.some((user) => user.id === session.user_id);
    if (!userExists) {
      return null;
    }

    return { ...session };
  }

  async deleteSessionById(sessionId: string): Promise<boolean> {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      const originalLength = this.data.sessions.length;
      this.data.sessions = this.data.sessions.filter((session) => session.id !== sessionId);
      if (this.data.sessions.length === originalLength) {
        return false;
      }
      try {
        await this.saveData();
        return true;
      } catch (error) {
        this.restoreData(original);
        throw error;
      }
    });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      const originalLength = this.data.sessions.length;
      this.data.sessions = this.data.sessions.filter(
        (session) => session.token_hash !== tokenHash
      );
      if (this.data.sessions.length === originalLength) {
        return false;
      }
      try {
        await this.saveData();
        return true;
      } catch (error) {
        this.restoreData(original);
        throw error;
      }
    });
  }

  async prepareChatTurn(input: PrepareChatTurnInput): Promise<{
    conversation: Conversation;
    message: Message;
  }> {
    return this.lockManager.withLock('database-write', async () => {
      const { userId, conversationId, message } = input;
      if (!userId || !message || message.role !== 'user' || !message.content?.trim()) {
        throw new DatabaseError('Invalid chat turn', 'INVALID_PARAM');
      }
      if (!this.data.users.some((user) => user.id === userId)) {
        throw new DatabaseError('User not found', 'NOT_FOUND');
      }

      const original = cloneDatabase(this.data);
      try {
        const now = new Date().toISOString();
        let conversation: Conversation;

        if (conversationId) {
          const existing = this.data.conversations.find((item) => item.id === conversationId);
          if (!existing) {
            throw new DatabaseError('Conversation not found', 'NOT_FOUND');
          }
          if (existing.user_id !== userId) {
            throw new DatabaseError('Conversation belongs to another user', 'FORBIDDEN');
          }
          conversation = existing;
        } else {
          conversation = {
            id: this.generateUniqueId(this.data.conversations),
            user_id: userId,
            title: input.title?.trim().slice(0, 120) || message.content.trim().slice(0, 60),
            provider_used: message.provider,
            model_used: message.model,
            created_at: now,
            updated_at: now
          };
          this.data.conversations.push(conversation);
        }

        const userMessage: Message = {
          id: this.generateUniqueId(this.data.messages),
          conversation_id: conversation.id,
          content: message.content,
          role: 'user',
          provider: message.provider,
          model: message.model,
          created_at: now,
          updated_at: now
        };
        this.data.messages.push(userMessage);
        conversation.updated_at = now;
        conversation.provider_used = message.provider || conversation.provider_used;
        conversation.model_used = message.model || conversation.model_used;

        await this.saveData();
        return {
          conversation: { ...conversation },
          message: { ...userMessage }
        };
      } catch (error) {
        this.restoreData(original);
        if (
          error instanceof DatabaseError &&
          ['INVALID_PARAM', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code)
        ) {
          throw error;
        }
        throw new DatabaseError('Failed to prepare chat turn', 'WRITE_ERROR', error);
      }
    });
  }

  async exportUserData(userId: string, includeCredentials = false) {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) {
      throw new DatabaseError('User not found', 'NOT_FOUND');
    }

    const conversations = this.data.conversations
      .filter((conversation) => conversation.user_id === userId)
      .map((conversation) => ({ ...conversation }));
    const conversationIds = new Set(conversations.map((conversation) => conversation.id));
    const messages = this.data.messages
      .filter((message) => conversationIds.has(message.conversation_id))
      .map((message) => ({ ...message }));
    const providers = this.data.ai_providers
      .filter((provider) => provider.user_id === userId)
      .map((provider) => {
        const clone = { ...provider };
        return includeCredentials ? clone : stripCredentials(clone) as AIProvider;
      });

    return {
      version: '2.0',
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        created_at: user.created_at
      },
      conversations,
      messages,
      aiProviders: providers,
      metadata: {
        totalConversations: conversations.length,
        totalMessages: messages.length,
        totalAIProviders: providers.length,
        credentialsIncluded: includeCredentials
      }
    };
  }

  async getHealthReport(
    currentVersion = CURRENT_DATABASE_VERSION
  ): Promise<DatabaseHealthReport> {
    const userIds = new Set(this.data.users.map((user) => user.id));
    const conversationIds = new Set(this.data.conversations.map((conversation) => conversation.id));
    const duplicateUsernames = countDuplicateValues(
      this.data.users.map((user) => user.username.toLocaleLowerCase())
    );
    const duplicateIds = [
      this.data.users,
      this.data.ai_providers,
      this.data.conversations,
      this.data.messages,
      this.data.sessions
    ].reduce((total, records) => total + countDuplicateValues(records.map((item) => item.id)), 0);

    return {
      dbVersion: this.data.db_version,
      currentVersion,
      pendingMigrations: Array.from(
        { length: Math.max(0, currentVersion - this.data.db_version) },
        (_, index) => this.data.db_version + index + 1
      ),
      migrationHistory: this.getMigrationHistory(),
      counts: {
        users: this.data.users.length,
        conversations: this.data.conversations.length,
        messages: this.data.messages.length,
        aiProviders: this.data.ai_providers.length
      },
      integrity: {
        orphanMessages: this.data.messages.filter(
          (message) => !conversationIds.has(message.conversation_id)
        ).length,
        orphanConversations: this.data.conversations.filter(
          (conversation) => !userIds.has(conversation.user_id)
        ).length,
        duplicateUsernames,
        duplicateIds
      },
      latestBackup: await this.getLatestBackup()
    };
  }

  private restoreData(snapshot: DatabaseSchema): void {
    this.data = snapshot;
    this.dataCache = cloneDatabase(snapshot);
    this.cacheTimestamp = Date.now();
  }

  private generateUniqueId(records: Array<{ id: string }>): string {
    let id = uuidv4();
    const ids = new Set(records.map((record) => record.id));
    while (ids.has(id)) {
      id = uuidv4();
    }
    return id;
  }

  private async getLatestBackup(): Promise<DatabaseHealthReport['latestBackup']> {
    try {
      const directory = path.dirname(this.dbPath);
      const prefix = `${path.basename(this.dbPath)}.backup.`;
      const files = (await fs.readdir(directory)).filter((file) => file.startsWith(prefix));
      if (files.length === 0) {
        return null;
      }

      const backups = await Promise.all(files.map(async (filename) => {
        const stats = await fs.stat(path.join(directory, filename));
        return { filename, stats };
      }));
      const latest = backups.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)[0];
      return {
        filename: latest.filename,
        createdAt: latest.stats.mtime.toISOString(),
        sizeBytes: latest.stats.size
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 清理所有对话和消息数据 - 保留用户和AI配置
   */
  async clearAllConversations(): Promise<void> {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        this.data.conversations = [];
        this.data.messages = [];
        await this.saveData();
        console.log('已清理所有对话和消息数据');
      } catch (error) {
        this.restoreData(original);
        throw new DatabaseError(
          'Failed to clear conversations',
          'CLEAR_ERROR',
          error
        );
      }
    });
  }

  async importUserData(
    userId: string,
    importData: ImportPayload,
    mergeMode: ImportMergeMode = 'replace',
    options: { allowCredentials?: boolean } = {}
  ) {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!userId) {
          throw new DatabaseError('User ID is required', 'INVALID_PARAM');
        }

        const user = this.data.users.find(item => item.id === userId);
        if (!user) {
          throw new DatabaseError('User not found', 'NOT_FOUND');
        }

        const validation = this.validateImportPayload(userId, importData, mergeMode);
        if (!validation.valid) {
          throw new DatabaseError(validation.errors.join(', '), 'INVALID_IMPORT');
        }

        const conversations = importData.conversations || [];
        const messages = importData.messages || [];
        const aiProviders = importData.aiProviders || [];
        if (containsCredentials(aiProviders) && options.allowCredentials !== true) {
          throw new DatabaseError(
            'Credential import requires explicit confirmation',
            'CREDENTIAL_CONFIRMATION_REQUIRED'
          );
        }
        const now = new Date().toISOString();
        const conversationIdMap = new Map<string, string>();
        const existingCredentials = new Map(
          this.data.ai_providers
            .filter((provider) => provider.user_id === userId)
            .map((provider) => [provider.provider_name, provider.api_key])
        );

        const stats: ImportStats = {
          conversations: 0,
          messages: 0,
          aiProviders: 0,
          skipped: 0,
          errors: 0
        };

        if (mergeMode === 'replace') {
          const existingConversationIds = new Set(
            this.data.conversations
              .filter(conversation => conversation.user_id === userId)
              .map(conversation => conversation.id)
          );

          this.data.messages = this.data.messages.filter(
            message => !existingConversationIds.has(message.conversation_id)
          );
          this.data.conversations = this.data.conversations.filter(
            conversation => conversation.user_id !== userId
          );
          this.data.ai_providers = this.data.ai_providers.filter(
            provider => provider.user_id !== userId
          );
        }

        const reservedConversationIds = this.data.conversations.map(({ id }) => ({ id }));
        const reservedMessageIds = this.data.messages.map(({ id }) => ({ id }));
        const reservedProviderIds = this.data.ai_providers.map(({ id }) => ({ id }));

        for (const conversation of conversations) {
          const oldId = conversation.id!;
          const newId = mergeMode === 'merge'
            ? this.generateUniqueId(reservedConversationIds)
            : oldId;
          reservedConversationIds.push({ id: newId });
          conversationIdMap.set(oldId, newId);
          this.data.conversations.push({
            id: newId,
            user_id: userId,
            title: typeof conversation.title === 'string' ? conversation.title : 'Imported conversation',
            provider_used: conversation.provider_used,
            model_used: conversation.model_used,
            created_at: conversation.created_at || now,
            updated_at: conversation.updated_at || now
          });
          stats.conversations++;
        }

        for (const message of messages) {
          const mappedConversationId = conversationIdMap.get(message.conversation_id!) || message.conversation_id!;
          const messageId = mergeMode === 'merge'
            ? this.generateUniqueId(reservedMessageIds)
            : message.id!;
          reservedMessageIds.push({ id: messageId });
          this.data.messages.push({
            id: messageId,
            conversation_id: mappedConversationId,
            content: message.content!,
            role: message.role!,
            provider: message.provider,
            model: message.model,
            created_at: message.created_at || now,
            updated_at: message.updated_at,
            has_thinking: message.has_thinking,
            thinking_content: message.thinking_content,
            thinking_tokens: message.thinking_tokens,
            reasoning_effort: message.reasoning_effort,
            thought_signature: message.thought_signature,
            model_provider: message.model_provider,
            output_tokens: message.output_tokens
          });
          stats.messages++;
        }

        for (const provider of aiProviders) {
          const importedApiKey = Object.prototype.hasOwnProperty.call(provider, 'api_key')
            ? provider.api_key
            : existingCredentials.get(provider.provider_name!);
          const useResponsesApi = provider.use_responses_api;
          const providerId = mergeMode === 'merge'
            ? this.generateUniqueId(reservedProviderIds)
            : provider.id!;
          reservedProviderIds.push({ id: providerId });
          this.data.ai_providers.push({
            id: providerId,
            user_id: userId,
            provider_name: provider.provider_name!,
            api_key: importedApiKey,
            base_url: provider.base_url,
            available_models: Array.isArray(provider.available_models) ? provider.available_models : [],
            default_model: provider.default_model,
            is_active: provider.is_active ?? true,
            ...(useResponsesApi !== undefined ? { use_responses_api: useResponsesApi } : {}),
            created_at: provider.created_at || now,
            updated_at: provider.updated_at || now
          });
          stats.aiProviders++;
        }

        await this.saveData();
        return { data: stats, error: null };
      } catch (error) {
        this.restoreData(original);
        console.error('Failed to import user data:', safeErrorMessage(error));
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to import user data',
            code: error instanceof DatabaseError ? error.code : 'IMPORT_ERROR'
          }
        };
      }
    });
  }

  async clearConversationsByUserId(userId: string): Promise<void> {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!userId) {
          throw new DatabaseError('User ID is required', 'INVALID_PARAM');
        }

        const conversationIds = new Set(
          this.data.conversations
            .filter(conversation => conversation.user_id === userId)
            .map(conversation => conversation.id)
        );

        this.data.conversations = this.data.conversations.filter(
          conversation => conversation.user_id !== userId
        );
        this.data.messages = this.data.messages.filter(
          message => !conversationIds.has(message.conversation_id)
        );
        await this.saveData();
      } catch (error) {
        this.restoreData(original);
        throw new DatabaseError(
          'Failed to clear user conversations',
          'CLEAR_ERROR',
          error
        );
      }
    });
  }

  async deleteConversationById(conversationId: string) {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!conversationId) {
          throw new DatabaseError('Conversation ID is required', 'INVALID_PARAM');
        }

        const conversationIndex = this.data.conversations.findIndex(
          conversation => conversation.id === conversationId
        );

        if (conversationIndex === -1) {
          return {
            data: null,
            error: {
              message: 'Conversation not found',
              code: 'NOT_FOUND'
            }
          };
        }

        const [deletedConversation] = this.data.conversations.splice(conversationIndex, 1);
        const deletedMessages = this.data.messages.filter(
          message => message.conversation_id === conversationId
        );
        this.data.messages = this.data.messages.filter(
          message => message.conversation_id !== conversationId
        );

        await this.saveData();
        return {
          data: {
            conversation: deletedConversation,
            messages: deletedMessages
          },
          error: null
        };
      } catch (error) {
        this.restoreData(original);
        console.error('Failed to delete conversation:', safeErrorMessage(error));
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to delete conversation',
            code: error instanceof DatabaseError ? error.code : 'DELETE_ERROR'
          }
        };
      }
    });
  }

  /**
   * 删除会话末尾的助手消息（用于"重新生成"）。
   * 末尾消息不是助手消息时不做任何修改（上一轮出错/取消时助手消息本就未持久化）。
   */
  async deleteTrailingAssistantMessage(conversationId: string) {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!conversationId) {
          throw new DatabaseError('Conversation ID is required', 'INVALID_PARAM');
        }

        // 与 getMessagesByConversationId 保持相同的 created_at 排序，
        // 确保删除的正是 UI 中显示为最后一条的消息
        const conversationMessages = this.data.messages
          .filter(message => message.conversation_id === conversationId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const lastMessage = conversationMessages[conversationMessages.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant') {
          return { data: null, error: null };
        }

        this.data.messages = this.data.messages.filter(message => message.id !== lastMessage.id);
        await this.saveData();
        return { data: lastMessage, error: null };
      } catch (error) {
        this.restoreData(original);
        console.error('Failed to delete trailing assistant message:', safeErrorMessage(error));
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to delete trailing assistant message',
            code: error instanceof DatabaseError ? error.code : 'DELETE_ERROR'
          }
        };
      }
    });
  }

  async forkConversationForUser(userId: string, conversationId: string) {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!userId || !conversationId) {
          throw new DatabaseError('User ID and conversation ID are required', 'INVALID_PARAM');
        }

        const conversation = this.data.conversations.find(
          item => item.id === conversationId && item.user_id === userId
        );

        if (!conversation) {
          return {
            data: null,
            error: {
              message: 'Conversation not found',
              code: 'NOT_FOUND'
            }
          };
        }

        const now = new Date().toISOString();
        const forkedConversation = {
          ...conversation,
          id: this.generateUniqueId(this.data.conversations),
          title: `${conversation.title || 'Untitled session'} (fork)`,
          created_at: now,
          updated_at: now
        };

        const sourceMessages = this.data.messages
          .filter(message => message.conversation_id === conversationId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        const reservedMessageIds = this.data.messages.map(({ id }) => ({ id }));
        const forkedMessages = sourceMessages.map((message) => {
          const id = this.generateUniqueId(reservedMessageIds);
          reservedMessageIds.push({ id });
          return {
            ...message,
            id,
            conversation_id: forkedConversation.id,
            created_at: now,
            updated_at: now
          };
        });

        this.data.conversations.push(forkedConversation);
        this.data.messages.push(...forkedMessages);
        await this.saveData();

        return {
          data: {
            conversation: forkedConversation,
            messages: forkedMessages
          },
          error: null
        };
      } catch (error) {
        this.restoreData(original);
        console.error('Failed to fork conversation:', safeErrorMessage(error));
        return {
          data: null,
          error: {
            message: error instanceof DatabaseError ? error.message : 'Failed to fork conversation',
            code: error instanceof DatabaseError ? error.code : 'FORK_ERROR'
          }
        };
      }
    });
  }

  private validateImportPayload(userId: string, importData: ImportPayload, mergeMode: ImportMergeMode) {
    const errors: string[] = [];
    const conversations = importData?.conversations || [];
    const messages = importData?.messages || [];
    const aiProviders = importData?.aiProviders || [];

    if (
      !importData ||
      typeof importData !== 'object' ||
      typeof importData.version !== 'string' ||
      !SUPPORTED_IMPORT_VERSIONS.has(importData.version)
    ) {
      errors.push('Unsupported or invalid backup version');
    }
    if (!Array.isArray(conversations)) errors.push('conversations must be an array');
    if (!Array.isArray(messages)) errors.push('messages must be an array');
    if (!Array.isArray(aiProviders)) errors.push('aiProviders must be an array');
    if (errors.length > 0) return { valid: false, errors };

    const importedConversationIds = new Set<string>();
    const ownedConversationIds = new Set(
      this.data.conversations
        .filter(conversation => conversation.user_id === userId)
        .map(conversation => conversation.id)
    );
    const otherUserConversationIds = new Set(
      this.data.conversations
        .filter(conversation => conversation.user_id !== userId)
        .map(conversation => conversation.id)
    );

    for (const conversation of conversations) {
      if (!conversation || typeof conversation !== 'object' || typeof conversation.id !== 'string' || !conversation.id.trim()) {
        errors.push('Every imported conversation must include an id');
        continue;
      }
      if (importedConversationIds.has(conversation.id)) {
        errors.push(`Duplicate imported conversation id: ${conversation.id}`);
      }
      if (mergeMode === 'replace' && otherUserConversationIds.has(conversation.id)) {
        errors.push(`Conversation ${conversation.id} conflicts with another user`);
      }
      importedConversationIds.add(conversation.id);
    }

    // Replace mode removes only messages owned through this user's current
    // conversations. Messages for other users and orphan messages are retained,
    // so imported IDs must not collide with either group.
    const retainedMessageIds = new Set(
      this.data.messages
        .filter(message => !ownedConversationIds.has(message.conversation_id))
        .map(message => message.id)
    );
    const importedMessageIds = new Set<string>();

    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        errors.push('Every imported message must be an object');
        continue;
      }
      if (typeof message.id !== 'string' || !message.id.trim()) {
        errors.push('Every imported message must include an id');
      } else {
        if (importedMessageIds.has(message.id)) {
          errors.push(`Duplicate imported message id: ${message.id}`);
        }
        if (mergeMode === 'replace' && retainedMessageIds.has(message.id)) {
          errors.push(`Message ${message.id} conflicts with retained data`);
        }
        importedMessageIds.add(message.id);
      }
      if (typeof message.conversation_id !== 'string' || !message.conversation_id.trim()) {
        errors.push('Every imported message must include a conversation_id');
      } else if (
        !importedConversationIds.has(message.conversation_id) &&
        !(mergeMode === 'merge' && ownedConversationIds.has(message.conversation_id))
      ) {
        errors.push(`Message ${message.id || '(unknown)'} references an unknown conversation`);
      }
      if (typeof message.content !== 'string') {
        errors.push(`Message ${message.id || '(unknown)'} must include string content`);
      }
      if (!['user', 'assistant', 'system'].includes(String(message.role))) {
        errors.push(`Message ${message.id || '(unknown)'} has an invalid role`);
      }
    }

    const otherUserProviderIds = new Set(
      this.data.ai_providers
        .filter(provider => provider.user_id !== userId)
        .map(provider => provider.id)
    );
    const importedProviderIds = new Set<string>();

    for (const provider of aiProviders) {
      if (!provider || typeof provider !== 'object') {
        errors.push('Every imported provider must be an object');
        continue;
      }
      if (typeof provider.id !== 'string' || !provider.id.trim()) {
        errors.push('Every imported provider must include an id');
      } else {
        if (importedProviderIds.has(provider.id)) {
          errors.push(`Duplicate imported provider id: ${provider.id}`);
        }
        if (mergeMode === 'replace' && otherUserProviderIds.has(provider.id)) {
          errors.push(`Provider ${provider.id} conflicts with another user`);
        }
        importedProviderIds.add(provider.id);
      }
      if (typeof provider.provider_name !== 'string' || !provider.provider_name.trim()) {
        errors.push('Every imported provider must include provider_name');
      }
      if (
        Object.prototype.hasOwnProperty.call(provider, 'api_key') &&
        typeof provider.api_key !== 'string'
      ) {
        errors.push(`Provider ${provider.id || '(unknown)'} has an invalid api_key`);
      }
      if (provider.base_url !== undefined && typeof provider.base_url !== 'string') {
        errors.push(`Provider ${provider.id || '(unknown)'} has an invalid base_url`);
      }
      if (provider.default_model !== undefined && typeof provider.default_model !== 'string') {
        errors.push(`Provider ${provider.id || '(unknown)'} has an invalid default_model`);
      }
      if (provider.available_models !== undefined && !Array.isArray(provider.available_models)) {
        errors.push(`Provider ${provider.id || '(unknown)'} has invalid available_models`);
      }
      if (provider.is_active !== undefined && typeof provider.is_active !== 'boolean') {
        errors.push(`Provider ${provider.id || '(unknown)'} has an invalid is_active flag`);
      }
      if (
        provider.use_responses_api !== undefined &&
        ![true, false, 'true', 'false'].includes(provider.use_responses_api as boolean | string)
      ) {
        errors.push(`Provider ${provider.id || '(unknown)'} has an invalid use_responses_api flag`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ============= 通用查询方法 =============

  /**
   * 提供链式 from().select() 查询接口
   */
  from(table: Exclude<keyof DatabaseSchema, 'db_version'>) {
    return {
      select: (_fields: string = '*') => {
        try {
          // 返回数据的浅拷贝，避免外部修改影响内部数据
          const data = (this.data[table] as any[]).map((item: any) => ({ ...item }));
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
        return this.lockManager.withLock('database-write', async () => {
          const original = cloneDatabase(this.data);
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

            if ((this.data[table] as Array<{ id?: string }>).some(
              (item) => item.id === newRecord.id
            )) {
              throw new DatabaseError(
                `Duplicate id in ${table}: ${newRecord.id}`,
                'DUPLICATE_ID'
              );
            }

            // Assistant persistence races with delete/clear operations. All
            // of them share database-write, so this check prevents an
            // upstream completion from recreating an orphan after its
            // conversation was removed.
            if (table === 'messages' && newRecord.role === 'assistant') {
              const conversationId = typeof newRecord.conversation_id === 'string'
                ? newRecord.conversation_id
                : '';
              if (!this.data.conversations.some((conversation) => conversation.id === conversationId)) {
                throw new DatabaseError('Conversation not found', 'NOT_FOUND');
              }
            }
            
            (this.data[table] as any[]).push(newRecord);
            await this.saveData();
            
            return {
              data: newRecord,
              error: null
            };
          } catch (error) {
            this.restoreData(original);
            console.error(`Failed to insert into ${table}:`, safeErrorMessage(error));
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
            return this.lockManager.withLock('database-write', async () => {
              const original = cloneDatabase(this.data);
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
                this.restoreData(original);
                console.error(`Failed to update ${table}:`, safeErrorMessage(error));
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
            return this.lockManager.withLock('database-write', async () => {
              const original = cloneDatabase(this.data);
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
                this.restoreData(original);
                console.error(`Failed to delete from ${table}:`, safeErrorMessage(error));
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
      console.error('Failed to get conversations:', safeErrorMessage(error));
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
      console.error('Failed to get messages:', safeErrorMessage(error));
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
      console.error('Failed to get AI provider config:', safeErrorMessage(error));
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
      console.error('Failed to get AI providers:', safeErrorMessage(error));
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
  async updateAIProviderConfig(userId: string, providerName: string, configData: unknown) {
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
      try {
        if (!userId || !providerName) {
          throw new DatabaseError('User ID and provider name are required', 'INVALID_PARAM');
        }

        if (!configData || typeof configData !== 'object') {
          throw new DatabaseError('Invalid config data', 'INVALID_DATA');
        }

        const safeConfig = sanitizeProviderConfig(configData as Record<string, unknown>);

        const existingIndex = this.data.ai_providers.findIndex(
          p => p.user_id === userId && p.provider_name === providerName
        );
        
        const now = new Date().toISOString();
        
        if (existingIndex !== -1) {
          // 更新现有配置
          this.data.ai_providers[existingIndex] = {
            ...this.data.ai_providers[existingIndex],
            ...safeConfig,
            user_id: userId,
            provider_name: providerName,
            updated_at: now
          };
          await this.saveData();
          return { data: this.data.ai_providers[existingIndex], error: null };
        } else {
          // 创建新配置
          const newConfig = {
            id: this.generateUniqueId(this.data.ai_providers),
            user_id: userId,
            provider_name: providerName,
            available_models: [],
            is_active: true,
            ...safeConfig,
            created_at: now,
            updated_at: now
          };
          this.data.ai_providers.push(newConfig);
          await this.saveData();
          return { data: newConfig, error: null };
        }
      } catch (error) {
        this.restoreData(original);
        console.error('Failed to update AI provider config:', safeErrorMessage(error));
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
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
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
        this.restoreData(original);
        console.error('Failed to change password:', safeErrorMessage(error));
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
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
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
          id: this.generateUniqueId(this.data.users),
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
        this.restoreData(original);
        console.error('Failed to create user:', safeErrorMessage(error));
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
    return this.lockManager.withLock('database-write', async () => {
      const original = cloneDatabase(this.data);
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
        this.restoreData(original);
        console.error('Failed to update last login:', safeErrorMessage(error));
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
      console.error('Failed to serialize thinking content:', safeErrorMessage(error));
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
      console.error('Failed to deserialize thinking content:', safeErrorMessage(error));
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
      console.error('Failed to get messages with thinking:', safeErrorMessage(error));
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
