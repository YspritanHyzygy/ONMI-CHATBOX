import {
  CURRENT_DATABASE_VERSION,
  JSONDatabase,
  jsonDatabase
} from './json-database.js';

export { CURRENT_DATABASE_VERSION };

/**
 * Run every schema migration in order. JSONDatabase.applyMigration creates a
 * byte-for-byte backup before changing the in-memory data and records the
 * completed migration in the database file.
 */
export async function runMigrations(database: JSONDatabase = jsonDatabase): Promise<void> {
  await database.init();

  if (database.getDatabaseVersion() < 2) {
    await database.applyMigration(2, 'Added thinking-chain message fields', (draft) => {
      draft.messages = draft.messages.map((message) => {
        if (message.has_thinking !== undefined) {
          return message;
        }
        return {
          ...message,
          has_thinking: false,
          model_provider: message.model_provider || message.provider
        };
      });
    });
  }

  if (database.getDatabaseVersion() < 3) {
    await database.applyMigration(3, 'Added persistent sessions and schema metadata', (draft) => {
      // Older files are normalized during load. Keeping this migration explicit
      // ensures the normalized fields are persisted only after a backup exists.
      draft.sessions = Array.isArray(draft.sessions) ? draft.sessions : [];
      draft.migrations = Array.isArray(draft.migrations) ? draft.migrations : [];
    });
  }

  if (database.getDatabaseVersion() > CURRENT_DATABASE_VERSION) {
    throw new Error(
      `Database version ${database.getDatabaseVersion()} is newer than supported version ${CURRENT_DATABASE_VERSION}`
    );
  }
}

export async function validateDatabase(database: JSONDatabase = jsonDatabase): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const messages = database.from('messages').select().data || [];
    const conversations = database.from('conversations').select().data || [];
    const users = database.from('users').select().data || [];
    const conversationIds = new Set(conversations.map((conversation) => conversation.id));
    const userIds = new Set(users.map((user) => user.id));

    for (const message of messages) {
      if (!message.id || !message.conversation_id || typeof message.content !== 'string') {
        errors.push(`Message ${message.id || '(unknown)'} is missing required fields`);
      }
      if (!conversationIds.has(message.conversation_id)) {
        warnings.push(`Message ${message.id || '(unknown)'} references a missing conversation`);
      }
      if (message.has_thinking === true && !message.thinking_content) {
        warnings.push(`Message ${message.id} has has_thinking=true but no thinking_content`);
      }
      if (message.thinking_content) {
        try {
          JSON.parse(message.thinking_content);
        } catch {
          errors.push(`Message ${message.id} has invalid thinking_content JSON`);
        }
      }
    }

    for (const conversation of conversations) {
      if (!conversation.id || !conversation.user_id) {
        errors.push(`Conversation ${conversation.id || '(unknown)'} is missing required fields`);
      } else if (!userIds.has(conversation.user_id)) {
        warnings.push(`Conversation ${conversation.id} references a missing user`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (error) {
    return {
      valid: false,
      errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings
    };
  }
}

/**
 * Manual repair helper retained for compatibility. It is never run at startup;
 * health reporting remains read-only and anomalous data is not auto-deleted.
 */
export async function cleanupInvalidThinkingData(
  database: JSONDatabase = jsonDatabase
): Promise<{ cleaned: number; errors: string[] }> {
  const errors: string[] = [];
  let cleaned = 0;

  try {
    const messages = database.from('messages').select().data || [];
    for (const message of messages) {
      const updates: Record<string, unknown> = {};
      if (message.thinking_content) {
        try {
          JSON.parse(message.thinking_content);
        } catch {
          updates.thinking_content = undefined;
          updates.has_thinking = false;
        }
      }
      if (message.has_thinking === true && !message.thinking_content) {
        updates.has_thinking = false;
      }
      if (message.has_thinking === false && message.thinking_content) {
        updates.has_thinking = true;
      }
      if (Object.keys(updates).length > 0) {
        const result = await database.from('messages').update(updates).eq('id', message.id);
        if (result.error) {
          errors.push(result.error.message);
        } else {
          cleaned++;
        }
      }
    }
  } catch (error) {
    errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { cleaned, errors };
}
