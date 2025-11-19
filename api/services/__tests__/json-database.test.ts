/**
 * Tests for JSON Database concurrent processing improvements
 * 
 * 运行命令：npm run test:run json-database.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { jsonDatabase } from '../json-database';
import fs from 'fs/promises';
import path from 'path';

describe('JSON Database - Concurrent Processing', () => {
  const testDbPath = path.join(process.cwd(), 'data', 'database.json');
  const backupPath = `${testDbPath}.test-backup`;

  beforeEach(async () => {
    // Backup existing database if it exists
    try {
      await fs.access(testDbPath);
      await fs.copyFile(testDbPath, backupPath);
    } catch {
      // No existing database
    }
    
    // Initialize fresh database
    await jsonDatabase.init();
  });

  afterEach(async () => {
    // Restore backup if it exists
    try {
      await fs.access(backupPath);
      await fs.copyFile(backupPath, testDbPath);
      await fs.unlink(backupPath);
    } catch {
      // No backup to restore
    }
    
    // Clear locks
    jsonDatabase.clearLocks();
  });

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
