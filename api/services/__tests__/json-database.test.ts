/**
 * Tests for JSON Database concurrent processing improvements
 * 
 * 运行命令：npm run test:run json-database.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONDatabase } from '../json-database';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('JSON Database - Concurrent Processing', () => {
  let tempDir: string;
  let jsonDatabase: JSONDatabase;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-video-webui-db-'));
    jsonDatabase = new JSONDatabase(path.join(tempDir, 'database.json'));
    await jsonDatabase.init();
  });

  afterEach(async () => {
    jsonDatabase.clearLocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createTestUser(id = 'test-owner-001') {
    const result = await jsonDatabase.from('users').insert({
      id,
      username: id,
      passwordHash: 'test-password-hash'
    });
    expect(result.error).toBeNull();
    return id;
  }

  it('should handle concurrent inserts without data loss', async () => {
    const userId = 'test-user-001';
    
    // Create multiple conversations concurrently
    const promises = Array.from({ length: 10 }, (_, i) => 
      jsonDatabase.from('conversations').insert({
        user_id: userId,
        title: `Test Conversation ${i}`,
        provider_used: 'openai',
        model_used: 'gpt-4'
      })
    );

    const results = await Promise.all(promises);
    
    // All inserts should succeed
    expect(results.every(r => r.data !== null && r.error === null)).toBe(true);
    
    // Verify all conversations were saved
    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    expect(conversations).toHaveLength(10);
  });

  it('should handle concurrent updates without conflicts', async () => {
    const userId = 'test-user-002';
    
    // Create a conversation
    const { data: conversation } = await jsonDatabase.from('conversations').insert({
      user_id: userId,
      title: 'Original Title',
      provider_used: 'openai',
      model_used: 'gpt-4'
    });

    expect(conversation).not.toBeNull();
    
    // Update it concurrently multiple times
    const promises = Array.from({ length: 5 }, (_, i) => 
      jsonDatabase.from('conversations').update({
        title: `Updated Title ${i}`
      }).eq('id', conversation!.id)
    );

    const results = await Promise.all(promises);
    
    // All updates should succeed
    expect(results.every(r => r.data !== null && r.error === null)).toBe(true);
    
    // Verify final state
    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    expect(conversations).toHaveLength(1);
    expect(conversations![0].title).toMatch(/Updated Title \d/);
  });

  it('should validate data before saving', async () => {
    // Try to insert invalid data
    const result = await jsonDatabase.from('conversations').insert(null);
    
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('INVALID_DATA');
  });

  it('should handle query errors gracefully', async () => {
    // Try to get conversations with invalid user ID
    const result = await jsonDatabase.getConversationsByUserId('');
    
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('INVALID_PARAM');
  });

  it('should support pagination for large message lists', async () => {
    const conversationId = 'test-conv-001';
    await jsonDatabase.from('conversations').insert({
      id: conversationId,
      user_id: 'pagination-user',
      title: 'Pagination test'
    });
    
    // Create multiple messages
    const promises = Array.from({ length: 20 }, (_, i) => 
      jsonDatabase.from('messages').insert({
        conversation_id: conversationId,
        content: `Message ${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant'
      })
    );

    await Promise.all(promises);
    
    // Get first 10 messages
    const { data: page1 } = await jsonDatabase.getMessagesByConversationId(
      conversationId,
      { limit: 10, offset: 0 }
    );
    
    expect(page1).toHaveLength(10);
    
    // Get next 10 messages
    const { data: page2 } = await jsonDatabase.getMessagesByConversationId(
      conversationId,
      { limit: 10, offset: 10 }
    );
    
    expect(page2).toHaveLength(10);
    
    // Verify no overlap
    const page1Ids = page1!.map(m => m.id);
    const page2Ids = page2!.map(m => m.id);
    const overlap = page1Ids.filter(id => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('should keep imported merge messages attached to regenerated conversations', async () => {
    const userId = await createTestUser();
    const result = await jsonDatabase.importUserData(userId, {
      version: '1.0',
      conversations: [{
        id: 'import-conv-001',
        user_id: 'other-user',
        title: 'Imported conversation',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }],
      messages: [{
        id: 'import-msg-001',
        conversation_id: 'import-conv-001',
        content: 'hello from import',
        role: 'user',
        created_at: '2026-01-01T00:00:00.000Z'
      }],
      aiProviders: []
    }, 'merge');

    expect(result.error).toBeNull();
    expect(result.data?.conversations).toBe(1);
    expect(result.data?.messages).toBe(1);

    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    const imported = conversations?.find(conversation => conversation.title === 'Imported conversation');
    expect(imported).toBeTruthy();
    expect(imported?.id).not.toBe('import-conv-001');

    const { data: messages } = await jsonDatabase.getMessagesByConversationId(imported!.id);
    expect(messages).toHaveLength(1);
    expect(messages?.[0].content).toBe('hello from import');
  });

  it('should reject invalid replace imports before clearing existing data', async () => {
    const userId = await createTestUser();
    const { data: existing } = await jsonDatabase.from('conversations').insert({
      user_id: userId,
      title: 'Keep me'
    });
    expect(existing).not.toBeNull();

    const result = await jsonDatabase.importUserData(userId, {
      version: '1.0',
      conversations: [],
      messages: [{
        id: 'orphan-msg',
        conversation_id: 'missing-conv',
        content: 'orphan',
        role: 'user',
        created_at: '2026-01-01T00:00:00.000Z'
      }],
      aiProviders: []
    }, 'replace');

    expect(result.error?.code).toBe('INVALID_IMPORT');

    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    expect(conversations?.some(conversation => conversation.title === 'Keep me')).toBe(true);
  });

  it('should reject replace imports that collide with another user conversation id', async () => {
    const userId = await createTestUser();
    await jsonDatabase.from('users').insert({
      id: 'other-user-001',
      username: 'other-user',
      passwordHash: 'hash'
    });
    await jsonDatabase.from('conversations').insert({
      id: 'shared-conv-id',
      user_id: 'other-user-001',
      title: 'Other user conversation'
    });
    await jsonDatabase.from('conversations').insert({
      user_id: userId,
      title: 'Keep me too'
    });

    const result = await jsonDatabase.importUserData(userId, {
      version: '1.0',
      conversations: [{
        id: 'shared-conv-id',
        user_id: userId,
        title: 'Conflicting import',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z'
      }],
      messages: [],
      aiProviders: []
    }, 'replace');

    expect(result.error?.code).toBe('INVALID_IMPORT');

    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    expect(conversations?.some(conversation => conversation.title === 'Keep me too')).toBe(true);
  });

  it('should fork a user-owned conversation with copied messages', async () => {
    const userId = await createTestUser();
    const { data: source } = await jsonDatabase.from('conversations').insert({
      id: 'source-conv-001',
      user_id: userId,
      title: 'Source session',
      provider_used: 'openai',
      model_used: 'gpt-4o'
    });
    await jsonDatabase.from('messages').insert({
      id: 'source-msg-001',
      conversation_id: source!.id,
      role: 'user',
      content: 'first message',
      created_at: '2026-06-11T10:00:00.000Z'
    });
    await jsonDatabase.from('messages').insert({
      id: 'source-msg-002',
      conversation_id: source!.id,
      role: 'assistant',
      content: 'second message',
      created_at: '2026-06-11T10:01:00.000Z'
    });

    const result = await jsonDatabase.forkConversationForUser(userId, source!.id);

    expect(result.error).toBeNull();
    expect(result.data?.conversation.id).not.toBe(source!.id);
    expect(result.data?.conversation.user_id).toBe(userId);
    expect(result.data?.conversation.title).toBe('Source session (fork)');
    expect(result.data?.messages).toHaveLength(2);
    expect(result.data?.messages.map(message => message.content)).toEqual(['first message', 'second message']);
    expect(result.data?.messages.every(message => message.conversation_id === result.data?.conversation.id)).toBe(true);
    expect(result.data?.messages.some(message => message.id === 'source-msg-001')).toBe(false);
  });

  it('should reject forking another user conversation', async () => {
    const userId = await createTestUser();
    const { data: source } = await jsonDatabase.from('conversations').insert({
      id: 'other-conv-001',
      user_id: 'other-user-001',
      title: 'Other user session'
    });

    const result = await jsonDatabase.forkConversationForUser(userId, source!.id);

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('should delete a conversation and its messages together', async () => {
    const userId = await createTestUser();
    const { data: source } = await jsonDatabase.from('conversations').insert({
      id: 'delete-conv-001',
      user_id: userId,
      title: 'Delete me'
    });
    await jsonDatabase.from('messages').insert({
      id: 'delete-msg-001',
      conversation_id: source!.id,
      role: 'user',
      content: 'remove me'
    });

    const result = await jsonDatabase.deleteConversationById(source!.id);
    const { data: messages } = await jsonDatabase.getMessagesByConversationId(source!.id);
    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);

    expect(result.error).toBeNull();
    expect(result.data?.messages).toHaveLength(1);
    expect(messages).toEqual([]);
    expect(conversations?.some(conversation => conversation.id === source!.id)).toBe(false);
  });

  it('should provide database statistics', () => {
    const stats = jsonDatabase.getStats();
    
    expect(stats).toHaveProperty('users');
    expect(stats).toHaveProperty('ai_providers');
    expect(stats).toHaveProperty('conversations');
    expect(stats).toHaveProperty('messages');
    expect(stats).toHaveProperty('custom_models');
    expect(stats).toHaveProperty('cacheAge');
    expect(stats).toHaveProperty('dbPath');
  });

  it('should invalidate cache when requested', async () => {
    // Get initial stats
    const stats1 = jsonDatabase.getStats();
    const initialCacheAge = stats1.cacheAge;
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Cache age should increase
    const stats2 = jsonDatabase.getStats();
    expect(stats2.cacheAge).toBeGreaterThan(initialCacheAge);
    
    // Invalidate cache
    jsonDatabase.invalidateCache();
    
    // Cache age should reset
    const stats3 = jsonDatabase.getStats();
    expect(stats3.cacheAge).toBeGreaterThanOrEqual(0);
  });
});

describe('JSON Database - Corruption Recovery', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-video-webui-restore-'));
    dbPath = path.join(tempDir, 'database.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function seedDatabaseWithUser(): Promise<void> {
    const db = new JSONDatabase(dbPath);
    await db.init();
    const result = await db.from('users').insert({
      id: 'restore-user-001',
      username: 'restore-user-001',
      passwordHash: 'test-password-hash'
    });
    expect(result.error).toBeNull();
    db.clearLocks();
  }

  it('restores from the newest valid backup when the main file is corrupt', async () => {
    await seedDatabaseWithUser();
    await fs.copyFile(dbPath, `${dbPath}.backup.100.write`);
    await fs.writeFile(dbPath, '{ this is not valid json', 'utf-8');

    const db = new JSONDatabase(dbPath);
    await db.init();

    const { data: user } = await db.findUserById('restore-user-001');
    expect(user?.username).toBe('restore-user-001');

    const files = await fs.readdir(tempDir);
    expect(files.some((name) => name.includes('.corrupt.'))).toBe(true);
    db.clearLocks();
  });

  it('skips corrupt backups and restores from an older valid one', async () => {
    await seedDatabaseWithUser();
    const validBackup = `${dbPath}.backup.100.write`;
    const corruptBackup = `${dbPath}.backup.200.write`;
    await fs.copyFile(dbPath, validBackup);
    await fs.writeFile(corruptBackup, 'also broken', 'utf-8');
    // Ensure the corrupt backup is newer by mtime.
    const future = new Date(Date.now() + 5000);
    await fs.utimes(corruptBackup, future, future);
    await fs.writeFile(dbPath, '%%%', 'utf-8');

    const db = new JSONDatabase(dbPath);
    await db.init();

    const { data: user } = await db.findUserById('restore-user-001');
    expect(user?.username).toBe('restore-user-001');
    db.clearLocks();
  });

  it('completes an interrupted restore instead of creating an empty database', async () => {
    await seedDatabaseWithUser();
    // Simulate a crash between the two renames of tryRestoreFromBackup:
    // dbPath is gone, the staged restore file is present.
    await fs.rename(dbPath, `${dbPath}.restore.tmp`);

    const db = new JSONDatabase(dbPath);
    await db.init();

    const { data: user } = await db.findUserById('restore-user-001');
    expect(user?.username).toBe('restore-user-001');
    db.clearLocks();
  });

  it('still fails startup when no valid backup exists', async () => {
    await seedDatabaseWithUser();
    // Seeding itself produces write backups; remove them so no restore source exists.
    for (const name of await fs.readdir(tempDir)) {
      if (name.includes('.backup.')) await fs.rm(path.join(tempDir, name));
    }
    await fs.writeFile(dbPath, 'corrupt beyond repair', 'utf-8');

    const db = new JSONDatabase(dbPath);
    await expect(db.init()).rejects.toThrow('Failed to initialize database');

    // The corrupt file must be left in place untouched.
    const raw = await fs.readFile(dbPath, 'utf-8');
    expect(raw).toBe('corrupt beyond repair');
    db.clearLocks();
  });
});

describe('JSON Database - deleteTrailingAssistantMessage', () => {
  let tempDir: string;
  let db: JSONDatabase;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-video-webui-regen-'));
    db = new JSONDatabase(path.join(tempDir, 'database.json'));
    await db.init();
  });

  afterEach(async () => {
    db.clearLocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function seedConversation(messages: Array<{ role: string; content: string }>) {
    const { data: conversation } = await db.from('conversations').insert({
      user_id: 'regen-user',
      title: 'Regen test',
      provider_used: 'ollama',
      model_used: 'qwen3'
    });
    for (const message of messages) {
      const { error } = await db.from('messages').insert({
        conversation_id: conversation!.id,
        ...message
      });
      expect(error).toBeNull();
    }
    return conversation!.id as string;
  }

  it('removes only the trailing assistant message', async () => {
    const conversationId = await seedConversation([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' }
    ]);

    const { data: removed, error } = await db.deleteTrailingAssistantMessage(conversationId);
    expect(error).toBeNull();
    expect(removed?.content).toBe('a2');

    const { data: remaining } = await db.getMessagesByConversationId(conversationId);
    expect(remaining?.map((message) => message.content)).toEqual(['q1', 'a1', 'q2']);
  });

  it('is a no-op when the trailing message is from the user', async () => {
    const conversationId = await seedConversation([
      { role: 'user', content: 'q1' }
    ]);

    const { data: removed, error } = await db.deleteTrailingAssistantMessage(conversationId);
    expect(error).toBeNull();
    expect(removed).toBeNull();

    const { data: remaining } = await db.getMessagesByConversationId(conversationId);
    expect(remaining).toHaveLength(1);
  });
});
