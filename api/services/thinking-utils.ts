/**
 * 思维链工具函数
 * 提供思维链处理的通用辅助方法
 */

import { ThinkingResponse, ReasoningEffort } from './types.js';

/**
 * 验证推理努力程度是否有效
 */
export function isValidReasoningEffort(effort: string): effort is ReasoningEffort {
  return ['minimal', 'low', 'medium', 'high'].includes(effort);
}

/**
 * 标准化思维链响应
 * 确保所有字段都符合规范
 */
export function normalizeThinkingResponse(thinking: Partial<ThinkingResponse>): ThinkingResponse {
  return {
    content: thinking.content || '',
    tokens: thinking.tokens,
    effort: thinking.effort && isValidReasoningEffort(thinking.effort) ? thinking.effort : undefined,
    summary: thinking.summary,
    signature: thinking.signature,
    providerData: thinking.providerData
  };
}

/**
 * 合并多个思维链内容片段
 * 用于流式响应的累积
 */
export function mergeThinkingContent(existing: string, newContent: string): string {
  if (!existing) return newContent;
  if (!newContent) return existing;
  return existing + newContent;
}

/**
 * 估算思维链的token数量
 * 简单的估算方法：每4个字符约等于1个token
 */
export function estimateTokens(content: string): number {
  if (!content) return 0;
  // 简单估算：英文约4字符/token，中文约1.5字符/token
  // 这里使用保守估算：3字符/token
  return Math.ceil(content.length / 3);
}

/**
 * 截断思维链内容
 * 用于显示或日志记录
 */
export function truncateThinking(content: string, maxLength: number = 200): string {
  if (!content || content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

/**
 * 验证思维链响应的完整性
 */
export function validateThinkingResponse(thinking: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!thinking) {
    errors.push('Thinking response is null or undefined');
    return { valid: false, errors };
  }
  
  if (typeof thinking !== 'object') {
    errors.push('Thinking response must be an object');
    return { valid: false, errors };
  }
  
  // content是必需的
  if (!thinking.content || typeof thinking.content !== 'string') {
    errors.push('Thinking content is required and must be a string');
  }
  
  // tokens如果存在，必须是数字
  if (thinking.tokens !== undefined && typeof thinking.tokens !== 'number') {
    errors.push('Thinking tokens must be a number');
  }
  
  // effort如果存在，必须是有效值
  if (thinking.effort !== undefined && !isValidReasoningEffort(thinking.effort)) {
    errors.push('Thinking effort must be one of: minimal, low, medium, high');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 从原始响应中安全提取字段
 */
export function safeExtract<T>(
  obj: any,
  path: string[],
  defaultValue?: T
): T | undefined {
  let current = obj;
  
  for (const key of path) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current !== undefined ? current : defaultValue;
}

/**
 * 检查响应是否包含思维链
 */
export function hasThinkingContent(response: any): boolean {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  // 检查常见的思维链字段
  return !!(
    response.reasoning_content ||
    response.thinking ||
    response.thought ||
    response.reasoning ||
    (response.thinking_content && response.thinking_content.content)
  );
}

/**
 * 格式化思维链用于日志输出
 */
export function formatThinkingForLog(thinking: ThinkingResponse): string {
  const parts: string[] = [];
  
  parts.push(`Content: ${truncateThinking(thinking.content, 100)}`);
  
  if (thinking.tokens) {
    parts.push(`Tokens: ${thinking.tokens}`);
  }
  
  if (thinking.effort) {
    parts.push(`Effort: ${thinking.effort}`);
  }
  
  if (thinking.summary) {
    parts.push(`Summary: ${truncateThinking(thinking.summary, 50)}`);
  }
  
  return parts.join(' | ');
}

/**
 * 计算思维链的统计信息
 */
export function calculateThinkingStats(thinkingList: ThinkingResponse[]): {
  totalCount: number;
  totalTokens: number;
  averageTokens: number;
  effortDistribution: Record<string, number>;
} {
  const stats = {
    totalCount: thinkingList.length,
    totalTokens: 0,
    averageTokens: 0,
    effortDistribution: {} as Record<string, number>
  };
  
  for (const thinking of thinkingList) {
    if (thinking.tokens) {
      stats.totalTokens += thinking.tokens;
    }
    
    if (thinking.effort) {
      stats.effortDistribution[thinking.effort] = 
        (stats.effortDistribution[thinking.effort] || 0) + 1;
    }
  }
  
  if (stats.totalCount > 0) {
    stats.averageTokens = Math.round(stats.totalTokens / stats.totalCount);
  }
  
  return stats;
}

/**
 * 比较两个思维链响应是否相同
 */
export function areThinkingResponsesEqual(
  a: ThinkingResponse | null,
  b: ThinkingResponse | null
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  
  return (
    a.content === b.content &&
    a.tokens === b.tokens &&
    a.effort === b.effort &&
    a.summary === b.summary &&
    a.signature === b.signature
  );
}

/**
 * 创建空的思维链响应
 */
export function createEmptyThinking(): ThinkingResponse {
  return {
    content: ''
  };
}

/**
 * 检查思维链是否为空
 */
export function isEmptyThinking(thinking: ThinkingResponse | null | undefined): boolean {
  if (!thinking) return true;
  return !thinking.content || thinking.content.trim().length === 0;
}

/**
 * 从错误中提取思维链信息（如果有）
 * 某些API在错误响应中也可能包含部分思维链
 */
export function extractThinkingFromError(error: any): ThinkingResponse | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  
  // 检查错误对象中是否有思维链相关字段
  if (error.thinking || error.reasoning_content) {
    return normalizeThinkingResponse({
      content: error.thinking || error.reasoning_content
    });
  }
  
  return null;
}

/**
 * 序列化思维链用于存储
 */
export function serializeThinking(thinking: ThinkingResponse): string {
  try {
    return JSON.stringify(thinking);
  } catch (error) {
    console.error('Failed to serialize thinking:', error);
    return JSON.stringify({ content: thinking.content || '' });
  }
}

/**
 * 反序列化思维链
 */
export function deserializeThinking(json: string): ThinkingResponse | null {
  try {
    const parsed = JSON.parse(json);
    return normalizeThinkingResponse(parsed);
  } catch (error) {
    console.error('Failed to deserialize thinking:', error);
    return null;
  }
}
