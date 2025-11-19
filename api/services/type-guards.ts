/**
 * Type guard utilities for runtime type checking
 * Provides safe type validation to replace 'as any' usage
 */

import { AIProvider, ChatMessage, MessageRole } from './types.js';

/**
 * Type guard for checking if a value is a valid AI provider
 */
export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && 
    ['openai', 'claude', 'gemini', 'xai', 'ollama', 'openai-responses'].includes(value);
}

/**
 * Type guard for checking if a value is a valid message role
 */
export function isMessageRole(value: unknown): value is MessageRole {
  return typeof value === 'string' && 
    ['user', 'assistant', 'system'].includes(value);
}

/**
 * Type guard for checking if a value is a valid chat message
 */
export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const msg = value as Record<string, unknown>;
  return isMessageRole(msg.role) && typeof msg.content === 'string';
}

/**
 * Type guard for checking if a value is an array of chat messages
 */
export function isChatMessageArray(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.every(isChatMessage);
}

/**
 * Type guard for checking if an object has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Type guard for checking if an object has a string property
 */
export function hasStringProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, string> {
  return hasProperty(obj, key) && typeof (obj as Record<K, unknown>)[key] === 'string';
}

/**
 * Type guard for checking if an object has a number property
 */
export function hasNumberProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, number> {
  return hasProperty(obj, key) && typeof (obj as Record<K, unknown>)[key] === 'number';
}

/**
 * Type guard for checking if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if a value is a valid error object
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error || 
    (isObject(value) && hasStringProperty(value, 'message'));
}

/**
 * Type guard for checking if an error has a status code
 */
export function hasStatusCode(error: unknown): error is Error & { status: number } {
  return isError(error) && hasNumberProperty(error, 'status');
}

/**
 * Type guard for checking if an error has a code property
 */
export function hasErrorCode(error: unknown): error is Error & { code: string } {
  return isError(error) && hasStringProperty(error, 'code');
}

/**
 * Safe JSON parse with type validation
 */
export function safeJsonParse<T>(
  json: string,
  validator?: (value: unknown) => value is T
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    
    if (validator && !validator(parsed)) {
      return {
        success: false,
        error: 'Parsed JSON does not match expected type'
      };
    }
    
    return {
      success: true,
      data: parsed as T
    };
  } catch (error) {
    return {
      success: false,
      error: isError(error) ? error.message : 'Failed to parse JSON'
    };
  }
}

/**
 * Safe property access with default value
 */
export function safeGet<T>(
  obj: unknown,
  path: string[],
  defaultValue: T
): T {
  let current: unknown = obj;
  
  for (const key of path) {
    if (!hasProperty(current, key)) {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[key];
  }
  
  return current as T;
}

/**
 * Validate and extract string from unknown value
 */
export function asString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}

/**
 * Validate and extract number from unknown value
 */
export function asNumber(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' ? value : defaultValue;
}

/**
 * Validate and extract boolean from unknown value
 */
export function asBoolean(value: unknown, defaultValue = false): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

/**
 * Type guard for checking if an object has a boolean property
 */
export function hasBooleanProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, boolean> {
  return hasProperty(obj, key) && typeof (obj as Record<K, unknown>)[key] === 'boolean';
}

/**
 * Validate and extract array from unknown value
 */
export function asArray<T>(
  value: unknown,
  validator?: (item: unknown) => item is T
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  
  if (validator) {
    return value.filter(validator);
  }
  
  return value as T[];
}

/**
 * Type guard for database query results
 */
export interface DatabaseResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export function isDatabaseSuccess<T>(
  result: DatabaseResult<T>
): result is { data: T; error: null } {
  return result.error === null && result.data !== null;
}

export function isDatabaseError<T>(
  result: DatabaseResult<T>
): result is { data: null; error: { message: string } } {
  return result.error !== null;
}

/**
 * Type guard for validating provider config structure
 */
export interface ProviderConfig {
  id: string;
  user_id: string;
  provider_name: string;
  api_key: string;
  default_model: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  base_url?: string;
  use_responses_api?: string | boolean;
}

export function isValidProviderConfig(value: unknown): value is ProviderConfig {
  if (!isObject(value)) {
    return false;
  }

  return (
    hasStringProperty(value, 'id') &&
    hasStringProperty(value, 'user_id') &&
    hasStringProperty(value, 'provider_name') &&
    hasStringProperty(value, 'api_key') &&
    hasStringProperty(value, 'default_model') &&
    hasBooleanProperty(value, 'is_active') &&
    hasStringProperty(value, 'created_at') &&
    hasStringProperty(value, 'updated_at')
  );
}

/**
 * Type guard for validating message structure
 */
export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  role: string;
  created_at: string;
  provider?: string;
  model?: string;
  
  // 思维链相关字段
  has_thinking?: boolean;
  thinking_content?: string; // JSON字符串
  thinking_tokens?: number;
  reasoning_effort?: string;
  thought_signature?: string;
  model_provider?: string;
  output_tokens?: number;
  updated_at?: string;
}

export function isValidMessage(value: unknown): value is Message {
  if (!isObject(value)) {
    return false;
  }

  return (
    hasStringProperty(value, 'id') &&
    hasStringProperty(value, 'conversation_id') &&
    hasStringProperty(value, 'content') &&
    hasStringProperty(value, 'role') &&
    hasStringProperty(value, 'created_at')
  );
}

/**
 * Type guard for checking if a value is a valid reasoning effort level
 */
export function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return typeof value === 'string' && 
    ['minimal', 'low', 'medium', 'high'].includes(value);
}

/**
 * Type guard for checking if a value is a valid thinking content structure
 */
export interface ThinkingContent {
  content: string;
  tokens?: number;
  effort?: string;
  summary?: string;
  signature?: string;
  providerData?: Record<string, any>;
}

export function isThinkingContent(value: unknown): value is ThinkingContent {
  if (!isObject(value)) {
    return false;
  }
  
  // content is required
  if (!hasStringProperty(value, 'content')) {
    return false;
  }
  
  // Optional fields validation
  const obj = value as Record<string, unknown>;
  
  if (obj.tokens !== undefined && typeof obj.tokens !== 'number') {
    return false;
  }
  
  if (obj.effort !== undefined && typeof obj.effort !== 'string') {
    return false;
  }
  
  if (obj.summary !== undefined && typeof obj.summary !== 'string') {
    return false;
  }
  
  if (obj.signature !== undefined && typeof obj.signature !== 'string') {
    return false;
  }
  
  if (obj.providerData !== undefined && !isObject(obj.providerData)) {
    return false;
  }
  
  return true;
}

/**
 * Type guard for checking if a message has thinking content
 */
export interface MessageWithThinking extends Message {
  has_thinking?: boolean;
  thinking_content?: string; // JSON string
  thinking_tokens?: number;
  reasoning_effort?: string;
  thought_signature?: string;
  model_provider?: string;
}

export function isMessageWithThinking(value: unknown): value is MessageWithThinking {
  if (!isValidMessage(value)) {
    return false;
  }
  
  const msg = value as unknown as Record<string, unknown>;
  
  // Validate optional thinking fields
  if (msg.has_thinking !== undefined && typeof msg.has_thinking !== 'boolean') {
    return false;
  }
  
  if (msg.thinking_content !== undefined && typeof msg.thinking_content !== 'string') {
    return false;
  }
  
  if (msg.thinking_tokens !== undefined && typeof msg.thinking_tokens !== 'number') {
    return false;
  }
  
  if (msg.reasoning_effort !== undefined && typeof msg.reasoning_effort !== 'string') {
    return false;
  }
  
  if (msg.thought_signature !== undefined && typeof msg.thought_signature !== 'string') {
    return false;
  }
  
  if (msg.model_provider !== undefined && typeof msg.model_provider !== 'string') {
    return false;
  }
  
  return true;
}

/**
 * Parse thinking content from JSON string
 */
export function parseThinkingContent(json: string): ThinkingContent | null {
  const result = safeJsonParse<ThinkingContent>(json, isThinkingContent);
  return result.success ? result.data : null;
}

/**
 * Type guard for thinking parameters
 */
export interface ThinkingParameters {
  enableThinking?: boolean;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  thinkingBudget?: number;
  includeThoughts?: boolean;
  thoughtSignatures?: string;
  hideThinking?: boolean;
  reasoningMode?: 'enabled' | 'auto' | 'disabled';
}

export function isThinkingParameters(value: unknown): value is ThinkingParameters {
  if (!isObject(value)) {
    return false;
  }
  
  const params = value as Record<string, unknown>;
  
  if (params.enableThinking !== undefined && typeof params.enableThinking !== 'boolean') {
    return false;
  }
  
  if (params.reasoningEffort !== undefined && !isReasoningEffort(params.reasoningEffort)) {
    return false;
  }
  
  if (params.thinkingBudget !== undefined && typeof params.thinkingBudget !== 'number') {
    return false;
  }
  
  if (params.includeThoughts !== undefined && typeof params.includeThoughts !== 'boolean') {
    return false;
  }
  
  if (params.thoughtSignatures !== undefined && typeof params.thoughtSignatures !== 'string') {
    return false;
  }
  
  if (params.hideThinking !== undefined && typeof params.hideThinking !== 'boolean') {
    return false;
  }
  
  if (params.reasoningMode !== undefined) {
    const validModes = ['enabled', 'auto', 'disabled'];
    if (typeof params.reasoningMode !== 'string' || !validModes.includes(params.reasoningMode)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Safely extract thinking parameters from unknown value
 */
export function extractThinkingParameters(value: unknown): ThinkingParameters {
  if (!isObject(value)) {
    return {};
  }
  
  const params: ThinkingParameters = {};
  const obj = value as Record<string, unknown>;
  
  if (typeof obj.enableThinking === 'boolean') {
    params.enableThinking = obj.enableThinking;
  }
  
  if (isReasoningEffort(obj.reasoningEffort)) {
    params.reasoningEffort = obj.reasoningEffort;
  }
  
  if (typeof obj.thinkingBudget === 'number') {
    params.thinkingBudget = obj.thinkingBudget;
  }
  
  if (typeof obj.includeThoughts === 'boolean') {
    params.includeThoughts = obj.includeThoughts;
  }
  
  if (typeof obj.thoughtSignatures === 'string') {
    params.thoughtSignatures = obj.thoughtSignatures;
  }
  
  if (typeof obj.hideThinking === 'boolean') {
    params.hideThinking = obj.hideThinking;
  }
  
  if (typeof obj.reasoningMode === 'string' && 
      ['enabled', 'auto', 'disabled'].includes(obj.reasoningMode)) {
    params.reasoningMode = obj.reasoningMode as 'enabled' | 'auto' | 'disabled';
  }
  
  return params;
}
