import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  CURRENT_DATABASE_VERSION,
  JSONDatabase
} from '../json-database';
import { runMigrations, validateDatabase } from '../database-migration';
import {
  createSession,
  destroySession,
  hashSessionToken
} from '../../middleware/auth';

describe('database initialization, sessions, backups, and atomic writes', () => {
  let tempDir: string;
  let dbPath: string;
  let database: JSONDatabase;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onmi-database-security-'));
    dbPath = path.join(tempDir, 'database.json');
    database = new JSONDatabase(dbPath);
    await database.init();
  });

  afterEach(async () => {
    database.clearLocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createUser(username = 'owner') {
    const result = await database.createUser({ username, password: 'password123' });
    expect(result.error).toBeNull();
    return result.data!;
  }

  it('creates a current empty database without a fixed demo account', async () => {
    const stored = JSON.parse(await fs.readFile(dbPath, 'utf8'));

    expect(stored.users).toEqual([]);
    expect(stored.sessions).toEqual([]);
    expect(stored.db_version).toBe(CURRENT_DATABASE_VERSION);
    expect(stored.migrations).toEqual([]);
  });

  it('preserves corrupt database bytes and refuses to initialize', async () => {
    const corruptContent = '{"users": [this is not valid json';
    await fs.writeFile(dbPath, corruptContent, 'utf8');

    const corruptDatabase = new JSONDatabase(dbPath);
    await expect(corruptDatabase.init()).rejects.toThrow('Failed to initialize database');
    expect(await fs.readFile(dbPath, 'utf8')).toBe(corruptContent);
  });

  it('persists only a SHA-256 session hash across database instances and revokes it', async () => {
    const user = await createUser();
    const token = await createSession(user.id, database);
    const storedAfterLogin = await fs.readFile(dbPath, 'utf8');

    expect(storedAfterLogin).not.toContain(token);
    expect(storedAfterLogin).toContain(hashSessionToken(token));

    const reloaded = new JSONDatabase(dbPath);
    await reloaded.init();
    const session = await reloaded.findValidSessionByTokenHash(hashSessionToken(token));
    expect(session?.user_id).toBe(user.id);

    expect(await destroySession(token, reloaded)).toBe(true);
    const afterLogout = new JSONDatabase(dbPath);
    await afterLogout.init();
    expect(await afterLogout.findValidSessionByTokenHash(hashSessionToken(token))).toBeNull();
  });

  it('rejects expired persisted sessions', async () => {
    const user = await createUser();
    const token = await createSession(user.id, database, -1);

    expect(await database.findValidSessionByTokenHash(hashSessionToken(token))).toBeNull();
  });

  it('backs up every migration, records history, is idempotent, and retains orphans', async () => {
    const legacyPath = path.join(tempDir, 'legacy.json');
    const legacy = {
      users: [],
      ai_providers: [],
      conversations: [{
        id: 'orphan-conversation',
        user_id: 'missing-user',
        title: 'orphan',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }],
      messages: [{
        id: 'orphan-message',
        conversation_id: 'missing-conversation',
        content: 'retain me',
        role: 'user',
        created_at: '2026-01-01T00:00:00.000Z'
      }],
      custom_models: []
    };
    await fs.writeFile(legacyPath, JSON.stringify(legacy, null, 2), 'utf8');
    const legacyDatabase = new JSONDatabase(legacyPath);

    await runMigrations(legacyDatabase);
    const firstHistory = legacyDatabase.getMigrationHistory();
    expect(firstHistory.map((migration) => migration.version)).toEqual([2, 3]);
    expect(legacyDatabase.getDatabaseVersion()).toBe(CURRENT_DATABASE_VERSION);

    const files = await fs.readdir(tempDir);
    const migrationBackups = files.filter((file) => file.includes('.backup.') && file.includes('migration-v'));
    expect(migrationBackups.some((file) => file.endsWith('migration-v2'))).toBe(true);
    expect(migrationBackups.some((file) => file.endsWith('migration-v3'))).toBe(true);
    const v2Backup = migrationBackups.find((file) => file.endsWith('migration-v2'))!;
    expect(JSON.parse(await fs.readFile(path.join(tempDir, v2Backup), 'utf8'))).toEqual(legacy);

    await runMigrations(legacyDatabase);
    expect(legacyDatabase.getMigrationHistory()).toEqual(firstHistory);
    expect((legacyDatabase.from('conversations').select().data || []).map((item) => item.id))
      .toContain('orphan-conversation');
    expect((legacyDatabase.from('messages').select().data || []).map((item) => item.id))
      .toContain('orphan-message');

    const validation = await validateDatabase(legacyDatabase);
    expect(validation.warnings.some((warning) => warning.includes('missing user'))).toBe(true);
    expect(validation.warnings.some((warning) => warning.includes('missing conversation'))).toBe(true);
  });

  it('reports health anomalies without exposing records or mutating them', async () => {
    await database.from('users').insert({
      id: 'user-a', username: 'duplicate', passwordHash: 'hash'
    });
    await database.from('users').insert({
      id: 'user-b', username: 'duplicate', passwordHash: 'hash'
    });
    await database.from('conversations').insert({
      id: 'orphan-conversation', user_id: 'missing-user', title: 'orphan'
    });
    await database.from('messages').insert({
      id: 'orphan-message', conversation_id: 'missing-conversation', content: 'orphan', role: 'user'
    });

    const report = await database.getHealthReport();
    expect(report.integrity).toMatchObject({
      orphanMessages: 1,
      orphanConversations: 1,
      duplicateUsernames: 1
    });
    expect(report.pendingMigrations).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('passwordHash');
    expect((database.from('messages').select().data || []).map((message) => message.id))
      .toContain('orphan-message');
  });

  it('atomically creates conversations with their first user messages under concurrency', async () => {
    const user = await createUser();
    const turns = await Promise.all(
      Array.from({ length: 10 }, (_, index) => database.prepareChatTurn({
        userId: user.id,
        title: `Conversation ${index}`,
        message: {
          content: `Message ${index}`,
          role: 'user',
          provider: 'openai',
          model: 'gpt-4o'
        }
      }))
    );

    expect(new Set(turns.map((turn) => turn.conversation.id)).size).toBe(10);
    expect(new Set(turns.map((turn) => turn.message.id)).size).toBe(10);
    expect(database.getStats().conversations).toBe(10);
    expect(database.getStats().messages).toBe(10);
    for (const turn of turns) {
      expect(turn.message.conversation_id).toBe(turn.conversation.id);
    }
  });

  it('enforces ownership and id uniqueness for database writes', async () => {
    const owner = await createUser('owner-one');
    const other = await createUser('owner-two');
    const first = await database.prepareChatTurn({
      userId: owner.id,
      message: { content: 'hello', role: 'user' }
    });

    await expect(database.prepareChatTurn({
      userId: other.id,
      conversationId: first.conversation.id,
      message: { content: 'cross-user write', role: 'user' }
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const duplicate = await database.from('conversations').insert({
      id: first.conversation.id,
      user_id: owner.id,
      title: 'duplicate'
    });
    expect(duplicate.error?.code).toBe('DUPLICATE_ID');
  });

  it('does not persist an assistant reply after its conversation was deleted', async () => {
    const user = await createUser('delete-race-owner');
    const turn = await database.prepareChatTurn({
      userId: user.id,
      message: { content: 'delete while generating', role: 'user' }
    });
    await database.deleteConversationById(turn.conversation.id);

    const assistant = await database.from('messages').insert({
      conversation_id: turn.conversation.id,
      content: 'late upstream response',
      role: 'assistant'
    });

    expect(assistant.error?.code).toBe('NOT_FOUND');
    expect((await database.getMessagesByConversationId(turn.conversation.id)).data).toEqual([]);
  });

  it('rolls back in-memory inserts, updates, deletes, and chat turns when persistence fails', async () => {
    const user = await createUser();
    const initial = await database.prepareChatTurn({
      userId: user.id,
      title: 'Original title',
      message: { content: 'persisted user message', role: 'user' }
    });
    await fs.mkdir(`${dbPath}.tmp`);

    const insert = await database.from('messages').insert({
      conversation_id: initial.conversation.id,
      content: 'must not leak into context',
      role: 'assistant'
    });
    expect(insert.error?.code).toBe('SAVE_ERROR');

    const update = await database.from('conversations')
      .update({ title: 'unpersisted title' })
      .eq('id', initial.conversation.id);
    expect(update.error?.code).toBe('SAVE_ERROR');

    const remove = await database.from('messages')
      .delete()
      .eq('id', initial.message.id);
    expect(remove.error?.code).toBe('SAVE_ERROR');

    await expect(database.prepareChatTurn({
      userId: user.id,
      conversationId: initial.conversation.id,
      message: { content: 'unpersisted follow-up', role: 'user' }
    })).rejects.toMatchObject({ code: 'WRITE_ERROR' });

    const conversations = await database.getConversationsByUserId(user.id);
    const messages = await database.getMessagesByConversationId(initial.conversation.id);
    expect(conversations.data?.[0].title).toBe('Original title');
    expect(messages.data?.map((message) => message.content)).toEqual(['persisted user message']);
  });

  it('exports v2 without credentials or sessions by default and preserves local keys on restore', async () => {
    const user = await createUser();
    await database.updateAIProviderConfig(user.id, 'openai', {
      api_key: 'sk-sensitive-value-1234567890',
      base_url: 'https://api.openai.com/v1',
      available_models: ['gpt-4o'],
      default_model: 'gpt-4o',
      is_active: true
    });
    await createSession(user.id, database);

    const safeExport = await database.exportUserData(user.id);
    expect(safeExport.version).toBe('2.0');
    expect(safeExport.metadata.credentialsIncluded).toBe(false);
    expect(JSON.stringify(safeExport)).not.toContain('sk-sensitive-value');
    expect(JSON.stringify(safeExport)).not.toContain('sessions');

    const credentialExport = await database.exportUserData(user.id, true);
    expect(JSON.stringify(credentialExport)).toContain('sk-sensitive-value-1234567890');

    const restore = await database.importUserData(user.id, safeExport, 'replace');
    expect(restore.error).toBeNull();
    const provider = await database.getAIProviderConfig(user.id, 'openai');
    expect(provider.data?.api_key).toBe('sk-sensitive-value-1234567890');
  });

  it('requires explicit confirmation before importing credentials', async () => {
    const user = await createUser();
    const payload = {
      version: '2.0',
      conversations: [],
      messages: [],
      aiProviders: [{
        id: 'provider-import',
        user_id: user.id,
        provider_name: 'openai',
        api_key: 'sk-imported-secret-1234567890',
        available_models: [],
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }]
    };

    const rejected = await database.importUserData(user.id, payload, 'replace');
    expect(rejected.error?.code).toBe('CREDENTIAL_CONFIRMATION_REQUIRED');
    expect((await database.getAIProvidersByUserId(user.id)).data).toEqual([]);

    const accepted = await database.importUserData(user.id, payload, 'replace', {
      allowCredentials: true
    });
    expect(accepted.error).toBeNull();
    expect((await database.getAIProviderConfig(user.id, 'openai')).data?.api_key)
      .toBe('sk-imported-secret-1234567890');
  });
});
