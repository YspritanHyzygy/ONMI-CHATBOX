#!/usr/bin/env node

/**
 * 修复数据库中的消息内容格式
 * 将对象格式的 content 转换为字符串
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/database.json');

console.log('🔧 开始修复消息内容格式...\n');

try {
  // 读取数据库
  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ 数据库文件不存在:', DB_PATH);
    process.exit(1);
  }

  const dbContent = fs.readFileSync(DB_PATH, 'utf8');
  const db = JSON.parse(dbContent);

  if (!db.messages || !Array.isArray(db.messages)) {
    console.log('✅ 数据库中没有消息数据');
    process.exit(0);
  }

  console.log(`📊 找到 ${db.messages.length} 条消息\n`);

  let fixedCount = 0;
  let errorCount = 0;

  // 修复每条消息
  db.messages = db.messages.map((message, index) => {
    try {
      // 检查 content 是否是字符串
      if (typeof message.content !== 'string') {
        console.log(`🔄 修复消息 #${index + 1}:`);
        console.log(`   原始类型: ${typeof message.content}`);
        
        let fixedContent = '';
        
        if (message.content === null || message.content === undefined) {
          fixedContent = '';
        } else if (typeof message.content === 'object') {
          // 检查是否是配置参数（如 format, verbosity 等）
          const isConfigObject = message.content.format || message.content.verbosity;
          
          if (isConfigObject) {
            // 这是一个配置对象，不是真正的消息内容
            fixedContent = '[系统配置参数，无文本内容]';
            console.log(`   ⚠️  检测到配置对象，已替换为提示文本`);
          } else if (message.content.text) {
            // 尝试提取文本
            fixedContent = message.content.text;
          } else if (Array.isArray(message.content)) {
            const textItem = message.content.find(item => 
              item && (item.type === 'text' || item.type === 'output_text') && item.text
            );
            if (textItem) {
              fixedContent = textItem.text;
            } else {
              fixedContent = JSON.stringify(message.content);
            }
          } else {
            fixedContent = JSON.stringify(message.content);
          }
        } else {
          fixedContent = String(message.content);
        }
        
        console.log('   修复后: 内容已规范化（为避免泄露用户数据，不输出预览）');
        console.log('');
        
        fixedCount++;
        return { ...message, content: fixedContent };
      }
      
      return message;
    } catch (error) {
      console.error(`❌ 修复消息 #${index + 1} 时出错:`, error.message);
      errorCount++;
      return message;
    }
  });

  // 备份原数据库
  const backupPath = DB_PATH + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, dbContent);
  console.log(`💾 已创建备份: ${backupPath}\n`);

  // 保存修复后的数据库
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  console.log('✅ 修复完成！');
  console.log(`   修复的消息数: ${fixedCount}`);
  console.log(`   错误数: ${errorCount}`);
  console.log(`   总消息数: ${db.messages.length}\n`);

} catch (error) {
  console.error('❌ 修复过程中出错:', error.message);
  process.exit(1);
}
