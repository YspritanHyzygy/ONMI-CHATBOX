/**
 * API Response validation utilities
 * Provides runtime validation for API responses to ensure type safety
 */

import { 
  isObject, 
  hasProperty, 
  hasStringProperty, 
  hasNumberProperty
} from './type-guards.js';
import { AIResponse, StreamResponse, AIProvider } from './types.js';

/**
 * Validate OpenAI Chat Completion response
 */
export function validateOpenAIChatResponse(response: unknown): {
  valid: boolean;
  content?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
} {
  if (!isObject(response)) {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check for choices array
  if (!hasProperty(response, 'choices') || !Array.isArray(response.choices)) {
    return { valid: false, error: 'Response missing choices array' };
  }

  const choices = response.choices;
  if (choices.length === 0) {
    return { valid: false, error: 'Choices array is empty' };
  }

  const firstChoice = choices[0];
  if (!isObject(firstChoice)) {
    return { valid: false, error: 'First choice is not an object' };
  }

  // Extract message content
  let content: string | undefined;
  if (hasProperty(firstChoice, 'message') && isObject(firstChoice.message)) {
    const message = firstChoice.message;
    if (hasStringProperty(message, 'content')) {
      content = message.content;
    }
  }

  if (!content) {
    return { valid: false, error: 'No content found in response' };
  }

  // Extract model
  const model = hasStringProperty(response, 'model') ? response.model : undefined;

  // Extract usage
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  if (hasProperty(response, 'usage') && isObject(response.usage)) {
    const usageObj = response.usage;
    if (
      hasNumberProperty(usageObj, 'prompt_tokens') &&
      hasNumberProperty(usageObj, 'completion_tokens') &&
      hasNumberProperty(usageObj, 'total_tokens')
    ) {
      usage = {
        promptTokens: usageObj.prompt_tokens,
        completionTokens: usageObj.completion_tokens,
        totalTokens: usageObj.total_tokens
      };
    }
  }

  return {
    valid: true,
    content,
    model,
    usage
  };
}

/**
 * Validate OpenAI Responses API response
 */
export function validateOpenAIResponsesAPIResponse(response: unknown): {
  valid: boolean;
  content?: string;
  model?: string;
  responseId?: string;
  createdAt?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
} {
  if (!isObject(response)) {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check response status
  if (hasStringProperty(response, 'status')) {
    const status = response.status;
    if (status !== 'completed') {
      return {
        valid: false,
        error: `Response status is ${status}, expected 'completed'`
      };
    }
  }

  // Extract content from various possible locations
  let content: string | undefined;

  // Try output_text first
  if (hasStringProperty(response, 'output_text')) {
    content = response.output_text;
  }
  // Try output array
  else if (hasProperty(response, 'output') && Array.isArray(response.output)) {
    const output = response.output;
    if (output.length > 0) {
      const firstOutput = output[0];
      if (isObject(firstOutput)) {
        // Try content field
        if (hasStringProperty(firstOutput, 'content')) {
          content = firstOutput.content;
        }
        // Try content array
        else if (hasProperty(firstOutput, 'content') && Array.isArray(firstOutput.content)) {
          const contentArray = firstOutput.content;
          for (const item of contentArray) {
            if (isObject(item) && hasStringProperty(item, 'text')) {
              content = item.text;
              break;
            }
          }
        }
        // Try text field
        else if (hasStringProperty(firstOutput, 'text')) {
          content = firstOutput.text;
        }
      }
    }
  }

  if (!content) {
    return { valid: false, error: 'No content found in response' };
  }

  // Extract other fields
  const model = hasStringProperty(response, 'model') ? response.model : undefined;
  const responseId = hasStringProperty(response, 'id') ? response.id : undefined;
  const createdAt = hasNumberProperty(response, 'created') ? response.created : undefined;

  // Extract usage
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  if (hasProperty(response, 'usage') && isObject(response.usage)) {
    const usageObj = response.usage;
    if (
      hasNumberProperty(usageObj, 'prompt_tokens') &&
      hasNumberProperty(usageObj, 'completion_tokens') &&
      hasNumberProperty(usageObj, 'total_tokens')
    ) {
      usage = {
        promptTokens: usageObj.prompt_tokens,
        completionTokens: usageObj.completion_tokens,
        totalTokens: usageObj.total_tokens
      };
    }
  }

  return {
    valid: true,
    content,
    model,
    responseId,
    createdAt,
    usage
  };
}

/**
 * Validate Claude response
 */
export function validateClaudeResponse(response: unknown): {
  valid: boolean;
  content?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
} {
  if (!isObject(response)) {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check for content array
  if (!hasProperty(response, 'content') || !Array.isArray(response.content)) {
    return { valid: false, error: 'Response missing content array' };
  }

  const contentArray = response.content;
  if (contentArray.length === 0) {
    return { valid: false, error: 'Content array is empty' };
  }

  // Find text content
  let content: string | undefined;
  for (const item of contentArray) {
    if (isObject(item) && hasStringProperty(item, 'type') && item.type === 'text') {
      if (hasStringProperty(item, 'text')) {
        content = item.text;
        break;
      }
    }
  }

  if (!content) {
    return { valid: false, error: 'No text content found in response' };
  }

  // Extract model
  const model = hasStringProperty(response, 'model') ? response.model : undefined;

  // Extract usage
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  if (hasProperty(response, 'usage') && isObject(response.usage)) {
    const usageObj = response.usage;
    if (
      hasNumberProperty(usageObj, 'input_tokens') &&
      hasNumberProperty(usageObj, 'output_tokens')
    ) {
      usage = {
        promptTokens: usageObj.input_tokens,
        completionTokens: usageObj.output_tokens,
        totalTokens: usageObj.input_tokens + usageObj.output_tokens
      };
    }
  }

  return {
    valid: true,
    content,
    model,
    usage
  };
}

/**
 * Validate Gemini response
 */
export function validateGeminiResponse(response: unknown): {
  valid: boolean;
  content?: string;
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
} {
  if (!isObject(response)) {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check for candidates array
  if (!hasProperty(response, 'candidates') || !Array.isArray(response.candidates)) {
    return { valid: false, error: 'Response missing candidates array' };
  }

  const candidates = response.candidates;
  if (candidates.length === 0) {
    return { valid: false, error: 'Candidates array is empty' };
  }

  const firstCandidate = candidates[0];
  if (!isObject(firstCandidate)) {
    return { valid: false, error: 'First candidate is not an object' };
  }

  // Extract content
  let content: string | undefined;
  if (hasProperty(firstCandidate, 'content') && isObject(firstCandidate.content)) {
    const contentObj = firstCandidate.content;
    if (hasProperty(contentObj, 'parts') && Array.isArray(contentObj.parts)) {
      const parts = contentObj.parts;
      if (parts.length > 0 && isObject(parts[0]) && hasStringProperty(parts[0], 'text')) {
        content = parts[0].text;
      }
    }
  }

  if (!content) {
    return { valid: false, error: 'No content found in response' };
  }

  // Extract model (Gemini doesn't always return model in response)
  const model = hasStringProperty(response, 'modelVersion') ? response.modelVersion : undefined;

  // Extract usage
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
  if (hasProperty(response, 'usageMetadata') && isObject(response.usageMetadata)) {
    const usageObj = response.usageMetadata;
    if (
      hasNumberProperty(usageObj, 'promptTokenCount') &&
      hasNumberProperty(usageObj, 'candidatesTokenCount') &&
      hasNumberProperty(usageObj, 'totalTokenCount')
    ) {
      usage = {
        promptTokens: usageObj.promptTokenCount,
        completionTokens: usageObj.candidatesTokenCount,
        totalTokens: usageObj.totalTokenCount
      };
    }
  }

  return {
    valid: true,
    content,
    model,
    usage
  };
}

/**
 * Build AIResponse from validated data
 */
export function buildAIResponse(
  validated: {
    content: string;
    model?: string;
    responseId?: string;
    createdAt?: number;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  },
  provider: AIProvider,
  fallbackModel: string
): AIResponse {
  return {
    content: validated.content,
    model: validated.model || fallbackModel,
    provider,
    responseId: validated.responseId,
    createdAt: validated.createdAt,
    usage: validated.usage
  };
}

/**
 * Validate stream chunk
 */
export function validateStreamChunk(
  chunk: unknown,
  provider: AIProvider
): {
  valid: boolean;
  content?: string;
  done?: boolean;
  model?: string;
  error?: string;
} {
  if (!isObject(chunk)) {
    return { valid: false, error: 'Chunk is not an object' };
  }

  let content: string | undefined;
  let done = false;
  let model: string | undefined;

  switch (provider) {
    case 'openai':
    case 'openai-responses':
      if (hasProperty(chunk, 'choices') && Array.isArray(chunk.choices) && chunk.choices.length > 0) {
        const choice = chunk.choices[0];
        if (isObject(choice)) {
          if (hasProperty(choice, 'delta') && isObject(choice.delta)) {
            const delta = choice.delta;
            if (hasStringProperty(delta, 'content')) {
              content = delta.content;
            }
          }
          if (hasStringProperty(choice, 'finish_reason') && choice.finish_reason) {
            done = true;
          }
        }
      }
      model = hasStringProperty(chunk, 'model') ? chunk.model : undefined;
      break;

    case 'claude':
      if (hasStringProperty(chunk, 'type')) {
        if (chunk.type === 'content_block_delta') {
          if (hasProperty(chunk, 'delta') && isObject(chunk.delta)) {
            const delta = chunk.delta;
            if (hasStringProperty(delta, 'text')) {
              content = delta.text;
            }
          }
        } else if (chunk.type === 'message_stop') {
          done = true;
        }
      }
      break;

    case 'gemini':
      if (hasProperty(chunk, 'candidates') && Array.isArray(chunk.candidates) && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        if (isObject(candidate) && hasProperty(candidate, 'content') && isObject(candidate.content)) {
          const contentObj = candidate.content;
          if (hasProperty(contentObj, 'parts') && Array.isArray(contentObj.parts)) {
            const parts = contentObj.parts;
            if (parts.length > 0 && isObject(parts[0]) && hasStringProperty(parts[0], 'text')) {
              content = parts[0].text;
            }
          }
        }
        if (isObject(candidate) && hasStringProperty(candidate, 'finishReason') && candidate.finishReason) {
          done = true;
        }
      }
      break;
  }

  return {
    valid: content !== undefined || done,
    content: content || '',
    done,
    model
  };
}

/**
 * Build StreamResponse from validated chunk
 */
export function buildStreamResponse(
  validated: {
    content: string;
    done: boolean;
    model?: string;
  },
  provider: AIProvider,
  fallbackModel: string
): StreamResponse {
  return {
    content: validated.content,
    done: validated.done,
    model: validated.model || fallbackModel,
    provider
  };
}

/**
 * Validate chat response structure
 */
export function validateChatResponse(response: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(response)) {
    errors.push('Response must be an object');
    return { valid: false, errors };
  }

  // Check success field
  if (!hasProperty(response, 'success')) {
    errors.push('Response missing success field');
  }

  const success = hasProperty(response, 'success') && response.success === true;

  if (success) {
    // For successful responses, validate required fields
    if (!hasStringProperty(response, 'response') || !response.response) {
      errors.push('Successful response must have non-empty response field');
    }

    if (!hasStringProperty(response, 'conversationId')) {
      errors.push('Successful response must have conversationId');
    }

    // Validate data structure if present
    if (hasProperty(response, 'data') && isObject(response.data)) {
      const data = response.data;
      
      if (!hasProperty(data, 'userMessage') || !isObject(data.userMessage)) {
        errors.push('Response data must have userMessage object');
      }
      
      if (!hasProperty(data, 'aiMessage') || !isObject(data.aiMessage)) {
        errors.push('Response data must have aiMessage object');
      }
    }
  } else {
    // For error responses, validate error field
    if (!hasStringProperty(response, 'error') || !response.error) {
      errors.push('Error response must have non-empty error field');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
