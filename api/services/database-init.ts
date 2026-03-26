/**
 * 共享的数据库初始化工具
 * 所有路由文件统一使用此函数来初始化 JSON 数据库
 */
import { jsonDatabase } from './json-database.js';

let dbInitialized = false;

export async function ensureDatabaseInitialized() {
  if (!dbInitialized) {
    await jsonDatabase.init();
    dbInitialized = true;
    console.log('JSON Database initialized successfully');
  }
  return jsonDatabase;
}
