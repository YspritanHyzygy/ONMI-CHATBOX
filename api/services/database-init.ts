import { jsonDatabase } from './json-database.js';
import { runMigrations } from './database-migration.js';

let initializationPromise: Promise<typeof jsonDatabase> | null = null;
let dbInitialized = false;

export function ensureDatabaseInitialized(): Promise<typeof jsonDatabase> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await runMigrations(jsonDatabase);
      dbInitialized = true;
      console.log('JSON database initialized and migrations completed');
      return jsonDatabase;
    })().catch((error) => {
      initializationPromise = null;
      dbInitialized = false;
      throw error;
    });
  }

  return initializationPromise;
}

export function isDatabaseInitialized(): boolean {
  return dbInitialized;
}
