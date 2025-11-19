/**
 * 思维链（Chain of Thought）相关的类型定义
 * 支持多个AI提供商的推理模型
 */

/**
 * 推理努力程度（OpenAI、Grok）
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/**
 * 推理模式（Grok）
 */
export type ReasoningMode = 'enabled' | 'auto' | 'disabled';

/**
 * 思维链内容结构
 */
export interface ThinkingContent {
  // 思维链文本内容
  content: string;
  
  // 思维链token数量
  tokens?: number;
  
  // 推理努力程度（OpenAI、Grok）
  effort?: ReasoningEffort;
  
  // 思维摘要（OpenAI Responses API）
  summary?: string;
  
  // 思维签名（Gemini多轮对话）
  signature?: string;
  
  // 提供商特定数据
  providerData?: Record<string, any>;
}

/**
 * 扩展的消息类型（前端使用）
 */
export interface MessageWithThinking {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  
  // 思维链相关字段
  has_thinking?: boolean;
  thinking_content?: ThinkingContent;
  
  // 模型信息
  provider?: string;
  model?: string;
  
  // Token统计
  thinking_tokens?: number;
  output_tokens?: number;
  
  created_at: string;
  updated_at?: string;
}

/**
 * AI请求参数扩展（包含思维链参数）
 */
export interface ThinkingParameters {
  // 是否启用思维链
  enableThinking?: boolean;
  
  // 推理努力程度（OpenAI、Grok）
  reasoningEffort?: ReasoningEffort;
  
  // 思维预算（Gemini、Claude）
  // -1为动态分配，0为关闭，正整数为token预算
  thinkingBudget?: number;
  
  // 是否包含思维内容（Gemini）
  includeThoughts?: boolean;
  
  // 上一轮的思维签名（Gemini多轮对话）
  thoughtSignatures?: string;
  
  // 是否隐藏思维过程（Ollama）
  hideThinking?: boolean;
  
  // 推理模式（Grok）
  reasoningMode?: ReasoningMode;
}

/**
 * 完整的AI请求参数（包含现有参数和思维链参数）
 */
export interface AIRequestParameters extends ThinkingParameters {
  // 现有参数
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  
  // OpenAI Responses API
  useResponsesAPI?: boolean;
  previousResponseId?: string;
  store?: boolean;
  
  // Ollama特有参数
  numPredict?: number;
  numCtx?: number;
  repeatPenalty?: number;
  
  // Research模型工具配置
  tools?: Array<{
    type: 'web_search' | 'code_interpreter' | 'file_search';
    enabled?: boolean;
  }>;
  background?: boolean;
}

/**
 * 流式思维链响应块
 */
export interface StreamThinkingChunk {
  thinking?: string;
  content?: string;
  done: boolean;
}

/**
 * 数据库消息记录（包含思维链字段）
 */
export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  
  // 思维链相关字段
  has_thinking?: boolean;
  thinking_content?: string; // JSON字符串
  thinking_tokens?: number;
  reasoning_effort?: string;
  thought_signature?: string;
  model_provider?: string;
  
  // 模型信息
  provider?: string;
  model?: string;
  
  // Token统计
  output_tokens?: number;
  
  // 时间戳
  created_at: string;
  updated_at?: string;
}

/**
 * 思维链错误类型
 */
export class ThinkingError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code: ThinkingErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'ThinkingError';
  }
}

/**
 * 思维链错误代码
 */
export enum ThinkingErrorCode {
  UNSUPPORTED_MODEL = 'UNSUPPORTED_MODEL',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED',
  SIGNATURE_MISSING = 'SIGNATURE_MISSING',
  PARSING_ERROR = 'PARSING_ERROR'
}

/**
 * 思维链适配器接口（用于不同AI提供商）
 */
export interface ThinkingAdapter {
  /**
   * 构建包含思维链参数的请求
   */
  buildThinkingRequest(
    messages: any[],
    config: any,
    parameters?: ThinkingParameters
  ): any;
  
  /**
   * 从响应中提取思维链
   */
  extractThinking(response: any): ThinkingContent | null;
  
  /**
   * 处理流式思维链
   */
  extractStreamThinking(chunk: any): StreamThinkingChunk;
  
  /**
   * 处理多轮对话上下文
   */
  prepareContextWithThinking(
    messages: any[],
    lastThinking?: ThinkingContent
  ): any[];
}

/**
 * 提供商特定的思维链配置
 */
export interface ProviderThinkingConfig {
  // OpenAI特定
  openai?: {
    reasoningEffort?: ReasoningEffort;
    maxOutputTokens?: number;
  };
  
  // Claude特定
  claude?: {
    thinkingBudget?: number;
    extendedThinking?: boolean;
  };
  
  // Gemini特定
  gemini?: {
    thinkingBudget?: number;
    includeThoughts?: boolean;
    thoughtSignatures?: string;
  };
  
  // Grok特定
  grok?: {
    reasoningEffort?: ReasoningEffort;
    reasoningMode?: ReasoningMode;
  };
  
  // Ollama特定
  ollama?: {
    think?: boolean;
    hideThinking?: boolean;
  };
}
