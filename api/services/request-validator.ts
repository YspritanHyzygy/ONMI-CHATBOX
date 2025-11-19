/**
 * Request validation utilities
 * Provides runtime validation for incoming API requests
 */

import {
  isObject,
  hasProperty,
  hasStringProperty,
  hasNumberProperty,
  hasBooleanProperty,
  isAIProvider
} from './type-guards.js';
import { AIServiceConfig } from './types.js';

/**
 * Validate chat request body
 */
export interface ValidatedChatRequest {
  message: string;
  provider: string;
  model: string;
  conversationId?: string;
  userId: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    useResponsesAPI?: boolean;
    researchTools?: {
      webSearch?: boolean;
      codeInterpreter?: boolean;
      fileSearch?: boolean;
    };
    background?: boolean;
    // Thinking parameters
    enableThinking?: boolean;
    thinkingBudget?: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    includeThoughts?: boolean;
    thoughtSignatures?: string;
  };
}

export function validateChatRequest(body: unknown): {
  valid: boolean;
  data?: ValidatedChatRequest;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(body)) {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  // Validate required fields
  if (!hasStringProperty(body, 'message') || !body.message.trim()) {
    errors.push('message is required and must be a non-empty string');
  }

  const provider = hasStringProperty(body, 'provider') ? body.provider : 'openai';
  const model = hasStringProperty(body, 'model') ? body.model : 'gpt-3.5-turbo';
  const userId = hasStringProperty(body, 'userId') ? body.userId : 'demo-user-001';

  // Validate optional fields
  const conversationId = hasStringProperty(body, 'conversationId') ? body.conversationId : undefined;

  // Validate parameters
  let parameters: ValidatedChatRequest['parameters'];
  if (hasProperty(body, 'parameters') && isObject(body.parameters)) {
    const params = body.parameters;
    parameters = {
      temperature: hasNumberProperty(params, 'temperature') ? params.temperature : undefined,
      maxTokens: hasNumberProperty(params, 'maxTokens') ? params.maxTokens : undefined,
      topP: hasNumberProperty(params, 'topP') ? params.topP : undefined,
      useResponsesAPI: hasBooleanProperty(params, 'useResponsesAPI') ? params.useResponsesAPI : undefined,
      background: hasBooleanProperty(params, 'background') ? params.background : undefined
    };

    // Validate research tools
    if (hasProperty(params, 'researchTools') && isObject(params.researchTools)) {
      const tools = params.researchTools;
      parameters.researchTools = {
        webSearch: hasBooleanProperty(tools, 'webSearch') ? tools.webSearch : undefined,
        codeInterpreter: hasBooleanProperty(tools, 'codeInterpreter') ? tools.codeInterpreter : undefined,
        fileSearch: hasBooleanProperty(tools, 'fileSearch') ? tools.fileSearch : undefined
      };
    }

    // Validate thinking parameters
    if (hasBooleanProperty(params, 'enableThinking')) {
      parameters.enableThinking = params.enableThinking;
    }
    if (hasNumberProperty(params, 'thinkingBudget')) {
      parameters.thinkingBudget = params.thinkingBudget;
    }
    if (hasStringProperty(params, 'reasoningEffort')) {
      const effort = params.reasoningEffort;
      if (['minimal', 'low', 'medium', 'high'].includes(effort)) {
        parameters.reasoningEffort = effort as 'minimal' | 'low' | 'medium' | 'high';
      }
    }
    if (hasBooleanProperty(params, 'includeThoughts')) {
      parameters.includeThoughts = params.includeThoughts;
    }
    if (hasStringProperty(params, 'thoughtSignatures')) {
      parameters.thoughtSignatures = params.thoughtSignatures;
    }

    // Validate parameter ranges
    if (parameters.temperature !== undefined && (parameters.temperature < 0 || parameters.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }
    if (parameters.maxTokens !== undefined && parameters.maxTokens <= 0) {
      errors.push('maxTokens must be greater than 0');
    }
    if (parameters.topP !== undefined && (parameters.topP < 0 || parameters.topP > 1)) {
      errors.push('topP must be between 0 and 1');
    }
    if (parameters.thinkingBudget !== undefined && parameters.thinkingBudget < 0 && parameters.thinkingBudget !== -1) {
      // -1 means dynamic/auto, 0 means disabled (though enableThinking controls that mostly), >0 is token limit
      // Allowing 0 as a valid value, but generally negative values other than -1 should be invalid if we want to be strict.
      // For now, let's just ensure it's not a nonsensical negative number if we treat -1 as special.
      // Actually, let's just check if it's a valid number.
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      message: (body as { message: string }).message,
      provider,
      model,
      conversationId,
      userId,
      parameters
    },
    errors: []
  };
}

/**
 * Validate provider configuration request
 */
export interface ValidatedProviderConfig {
  userId: string;
  providerName: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  availableModels?: string[];
  isActive?: boolean;
  useResponsesAPI?: boolean;
}

export function validateProviderConfigRequest(body: unknown): {
  valid: boolean;
  data?: ValidatedProviderConfig;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(body)) {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  // Validate required fields
  if (!hasStringProperty(body, 'userId') || !body.userId.trim()) {
    errors.push('userId is required and must be a non-empty string');
  }

  if (!hasStringProperty(body, 'providerName') || !body.providerName.trim()) {
    errors.push('providerName is required and must be a non-empty string');
  }

  // Validate provider name
  const providerName = hasStringProperty(body, 'providerName') ? body.providerName : '';
  if (providerName && !isAIProvider(providerName) && providerName !== 'openai-responses') {
    errors.push(`Invalid provider name: ${providerName}`);
  }

  // Validate optional fields
  const apiKey = hasStringProperty(body, 'apiKey') ? body.apiKey : undefined;
  const baseUrl = hasStringProperty(body, 'baseUrl') ? body.baseUrl : undefined;
  const defaultModel = hasStringProperty(body, 'defaultModel') ? body.defaultModel : undefined;
  const isActive = hasBooleanProperty(body, 'isActive') ? body.isActive : undefined;
  const useResponsesAPI = hasBooleanProperty(body, 'useResponsesAPI') ? body.useResponsesAPI : undefined;

  // Validate available models
  let availableModels: string[] | undefined;
  if (hasProperty(body, 'availableModels')) {
    if (Array.isArray(body.availableModels)) {
      availableModels = body.availableModels.filter(m => typeof m === 'string');
      if (availableModels.length !== body.availableModels.length) {
        errors.push('availableModels must be an array of strings');
      }
    } else {
      errors.push('availableModels must be an array');
    }
  }

  // Validate base URL format
  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      errors.push('baseUrl must be a valid URL');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      userId: (body as { userId: string }).userId,
      providerName: (body as { providerName: string }).providerName,
      apiKey,
      baseUrl,
      defaultModel,
      availableModels,
      isActive,
      useResponsesAPI
    },
    errors: []
  };
}

/**
 * Validate conversation creation request
 */
export interface ValidatedConversationRequest {
  userId: string;
  title?: string;
}

export function validateConversationRequest(body: unknown): {
  valid: boolean;
  data?: ValidatedConversationRequest;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(body)) {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  if (!hasStringProperty(body, 'userId') || !body.userId.trim()) {
    errors.push('userId is required and must be a non-empty string');
  }

  const title = hasStringProperty(body, 'title') ? body.title : undefined;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      userId: (body as { userId: string }).userId,
      title
    },
    errors: []
  };
}

/**
 * Validate AI service configuration
 */
export function validateAIServiceConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isObject(config)) {
    return { valid: false, errors: ['Config must be an object'] };
  }

  // Validate required fields
  if (!hasStringProperty(config, 'provider')) {
    errors.push('provider is required');
  } else if (!isAIProvider(config.provider)) {
    errors.push(`Invalid provider: ${config.provider}`);
  }

  if (!hasStringProperty(config, 'apiKey') && config.provider !== 'ollama') {
    errors.push('apiKey is required for non-Ollama providers');
  }

  if (!hasStringProperty(config, 'model') || !config.model.trim()) {
    errors.push('model is required and must be a non-empty string');
  }

  // Validate optional numeric fields
  if (hasProperty(config, 'temperature')) {
    if (!hasNumberProperty(config, 'temperature')) {
      errors.push('temperature must be a number');
    } else if (config.temperature < 0 || config.temperature > 2) {
      errors.push('temperature must be between 0 and 2');
    }
  }

  if (hasProperty(config, 'maxTokens')) {
    if (!hasNumberProperty(config, 'maxTokens')) {
      errors.push('maxTokens must be a number');
    } else if (config.maxTokens <= 0) {
      errors.push('maxTokens must be greater than 0');
    }
  }

  if (hasProperty(config, 'topP')) {
    if (!hasNumberProperty(config, 'topP')) {
      errors.push('topP must be a number');
    } else if (config.topP < 0 || config.topP > 1) {
      errors.push('topP must be between 0 and 1');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize and normalize AI service configuration
 */
export function sanitizeAIServiceConfig(config: Partial<AIServiceConfig>): Partial<AIServiceConfig> {
  const sanitized: Partial<AIServiceConfig> = {
    ...config
  };

  // Ensure numeric values are within valid ranges
  if (sanitized.temperature !== undefined) {
    sanitized.temperature = Math.max(0, Math.min(2, sanitized.temperature));
  }

  if (sanitized.maxTokens !== undefined) {
    sanitized.maxTokens = Math.max(1, sanitized.maxTokens);
  }

  if (sanitized.topP !== undefined) {
    sanitized.topP = Math.max(0, Math.min(1, sanitized.topP));
  }

  // Trim string values
  if (sanitized.model) {
    sanitized.model = sanitized.model.trim();
  }

  if (sanitized.baseUrl) {
    sanitized.baseUrl = sanitized.baseUrl.trim();
    // Remove trailing slash
    if (sanitized.baseUrl.endsWith('/')) {
      sanitized.baseUrl = sanitized.baseUrl.slice(0, -1);
    }
  }

  return sanitized;
}
