/**
 * Manual verification script for JSON Database concurrent processing improvements
 * Run with: npx tsx api/services/__tests__/verify-concurrent-processing.ts
 */
import { jsonDatabase } from '../json-database.js';

async function testConcurrentInserts() {
  console.log('\n=== Testing Concurrent Inserts ===');
  const userId = 'test-user-concurrent';
  
  try {
    // Create multiple conversations concurrently
    const promises = Array.from({ length: 10 }, (_, i) => 
      jsonDatabase.from('conversations').insert({
        user_id: userId,
        title: `Concurrent Test ${i}`,
        provider_used: 'openai',
        model_used: 'gpt-4'
      })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.data !== null && r.error === null).length;
    
    console.log(`✓ Created ${successCount}/10 conversations concurrently`);
    
    // Verify all conversations were saved
    const { data: conversations } = await jsonDatabase.getConversationsByUserId(userId);
    console.log(`✓ Verified ${conversations?.length || 0} conversations in database`);
    
    return successCount === 10 && conversations?.length === 10;
  } catch (error) {
    console.error('✗ Concurrent insert test failed:', error);
    return false;
  }
}

async function testDataValidation() {
  console.log('\n=== Testing Data Validation ===');
  
  try {
    // Try to insert invalid data
    const result = await jsonDatabase.from('conversations').insert(null as any);
    
    if (result.error && result.error.code === 'INVALID_DATA') {
      console.log('✓ Invalid data rejected correctly');
      return true;
    } else {
      console.error('✗ Invalid data was not rejected');
      return false;
    }
  } catch (error) {
    console.error('✗ Data validation test failed:', error);
    return false;
  }
}

async function testPagination() {
  console.log('\n=== Testing Pagination ===');
  const conversationId = 'test-pagination-conv';
  
  try {
    // Create multiple messages
    const promises = Array.from({ length: 20 }, (_, i) => 
      jsonDatabase.from('messages').insert({
        conversation_id: conversationId,
        content: `Message ${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant'
      })
    );

    await Promise.all(promises);
    console.log('✓ Created 20 messages');
    
    // Get first 10 messages
    const { data: page1 } = await jsonDatabase.getMessagesByConversationId(
      conversationId,
      { limit: 10, offset: 0 }
    );
    
    console.log(`✓ Retrieved page 1: ${page1?.length || 0} messages`);
    
    // Get next 10 messages
    const { data: page2 } = await jsonDatabase.getMessagesByConversationId(
      conversationId,
      { limit: 10, offset: 10 }
    );
    
    console.log(`✓ Retrieved page 2: ${page2?.length || 0} messages`);
    
    // Verify no overlap
    const page1Ids = page1?.map(m => m.id) || [];
    const page2Ids = page2?.map(m => m.id) || [];
    const overlap = page1Ids.filter(id => page2Ids.includes(id));
    
    if (overlap.length === 0) {
      console.log('✓ No overlap between pages');
      return true;
    } else {
      console.error('✗ Pages have overlapping messages');
      return false;
    }
  } catch (error) {
    console.error('✗ Pagination test failed:', error);
    return false;
  }
}

async function testDatabaseStats() {
  console.log('\n=== Testing Database Statistics ===');
  
  try {
    const stats = jsonDatabase.getStats();
    
    console.log('Database Statistics:');
    console.log(`  - Users: ${stats.users}`);
    console.log(`  - AI Providers: ${stats.ai_providers}`);
    console.log(`  - Conversations: ${stats.conversations}`);
    console.log(`  - Messages: ${stats.messages}`);
    console.log(`  - Custom Models: ${stats.custom_models}`);
    console.log(`  - Cache Age: ${stats.cacheAge}ms`);
    console.log(`  - DB Path: ${stats.dbPath}`);
    
    return true;
  } catch (error) {
    console.error('✗ Stats test failed:', error);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');
  
  try {
    // Test invalid parameter
    const result1 = await jsonDatabase.getConversationsByUserId('');
    if (result1.error && result1.error.code === 'INVALID_PARAM') {
      console.log('✓ Empty user ID rejected correctly');
    } else {
      console.error('✗ Empty user ID was not rejected');
      return false;
    }
    
    // Test invalid update
    const result2 = await jsonDatabase.from('conversations').update(null as any).eq('id', 'test');
    if (result2.error && result2.error.code === 'INVALID_DATA') {
      console.log('✓ Invalid update data rejected correctly');
    } else {
      console.error('✗ Invalid update data was not rejected');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ Error handling test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log('Starting JSON Database Concurrent Processing Tests...');
  
  try {
    // Initialize database
    await jsonDatabase.init();
    console.log('✓ Database initialized');
    
    const results = {
      concurrentInserts: await testConcurrentInserts(),
      dataValidation: await testDataValidation(),
      pagination: await testPagination(),
      databaseStats: await testDatabaseStats(),
      errorHandling: await testErrorHandling()
    };
    
    console.log('\n=== Test Results ===');
    console.log(`Concurrent Inserts: ${results.concurrentInserts ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Data Validation: ${results.dataValidation ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Pagination: ${results.pagination ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Database Stats: ${results.databaseStats ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Error Handling: ${results.errorHandling ? '✓ PASS' : '✗ FAIL'}`);
    
    const allPassed = Object.values(results).every(r => r === true);
    console.log(`\n${allPassed ? '✓ All tests passed!' : '✗ Some tests failed'}`);
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during tests:', error);
    process.exit(1);
  }
}

runAllTests();
