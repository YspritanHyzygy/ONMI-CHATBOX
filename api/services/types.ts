/**
 * AI服务相关的类型定义
 */

// 工具类型定义（Research 模型支持）
export type ToolType = 'web_search' | 'code_interpreter' | 'file_search';

export interface ToolConfig {
  type: ToolType;
  enabled?: boolean;
}

// AI服务提供商类型
export type AIProvider = 'openai' | 'claude' | 'gemini' | 'xai' | 'ollama' | 'openai-responses';

// 消息角色
export type MessageRole = 'user' | 'assistant' | 'system';

// 聊天消息接口
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

// AI服务配置接口
export interface AIServiceConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number; // 核采样参数，控制生成文本的多样性
  topK?: number; // Top-K采样参数（Gemini、Claude、Ollama支持）
  frequencyPenalty?: number; // 频率惩罚，减少重复内容
  presencePenalty?: number; // 存在惩罚，鼓励谈论新话题
  stop?: string[]; // 停止序列
  // Ollama特有参数
  numPredict?: number; // 生成的最大token数（Ollama）
  numCtx?: number; // 上下文窗口大小（Ollama）
  repeatPenalty?: number; // 重复惩罚（Ollama）
  // OpenAI Responses API 相关配置
  useResponsesAPI?: boolean; // 是否使用 Responses API
  previousResponseId?: string; // 上一个响应的ID，用于链式对话
  store?: boolean; // 是否存储响应数据（默认30天）
  // Research 模型工具配置
  tools?: ToolConfig[]; // 工具配置列表
  background?: boolean; // 是否使用后台模式（Research 模型推荐）
  
  // 思维链参数
  enableThinking?: boolean; // 是否启用思维链
  reasoningEffort?: ReasoningEffort; // 推理努力程度（OpenAI、Grok）
  thinkingBudget?: number; // 思维预算（Gemini、Claude）-1为动态，0为关闭，正整数为限制
  includeThoughts?: boolean; // 是否包含思维内容（Gemini）
  thoughtSignatures?: string; // 上一轮的思维签名（Gemini多轮对话）
  hideThinking?: boolean; // 是否隐藏思维过程（Ollama）
  reasoningMode?: ReasoningMode; // 推理模式（Grok）
}

// 推理努力程度（OpenAI、Grok）
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

// 推理模式（Grok）
export type ReasoningMode = 'enabled' | 'auto' | 'disabled';

// 思维链响应结构
export interface ThinkingResponse {
  content: string;
  tokens?: number;
  effort?: ReasoningEffort;
  summary?: string;
  signature?: string;
  providerData?: Record<string, any>;
}

// AI响应接口
export interface AIResponse {
  content: string;
  model: string;
  provider: AIProvider;
  
  // 思维链数据
  thinking?: ThinkingResponse;
  
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    // 推理token数量（思维链）
    reasoningTokens?: number;
  };
  // Responses API 特有字段
  responseId?: string; // 响应ID，用于后续链式对话
  conversationId?: string; // 对话ID
  createdAt?: number; // 创建时间戳
}

// 流式响应接口
export interface StreamResponse {
  content: string;
  done: boolean;
  model: string;
  provider: AIProvider;
  
  // 思维链流式内容
  thinking?: {
    content: string;
    done: boolean;
  };
}

// 流式思维链响应块
export interface StreamThinkingChunk {
  thinking?: string;
  content?: string;
  done: boolean;
}

// AI服务适配器基础接口
export interface AIServiceAdapter {
  provider: AIProvider;
  
  // 发送聊天消息
  chat(messages: ChatMessage[], config: AIServiceConfig): Promise<AIResponse>;
  
  // 流式聊天（可选）
  streamChat?(messages: ChatMessage[], config: AIServiceConfig): AsyncGenerator<StreamResponse>;
  
  // 测试连接
  testConnection(config: AIServiceConfig): Promise<boolean>;
  
  // 获取可用模型列表
  getAvailableModels(config: AIServiceConfig): Promise<{ id: string; name: string }[]>;
  
  // Responses API 特有方法（可选）
  retrieveResponse?(responseId: string, config: AIServiceConfig): Promise<AIResponse>;
  deleteResponse?(responseId: string, config: AIServiceConfig): Promise<boolean>;
}

// 错误类型
export class AIServiceError extends Error {
  constructor(
    message: string,
    public provider: AIProvider,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}