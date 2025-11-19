/**
 * localStorage utility module with error handling, validation, and data consistency
 * Addresses Requirements: 9.1, 9.2, 9.3, 9.4
 */

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Type guard to check if a value is a valid object
 */
function isValidObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a valid array
 */
function isValidArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Safely get an item from localStorage with error handling
 */
export function getStorageItem<T>(key: string): StorageResult<T> {
  try {
    const item = localStorage.getItem(key);
    
    if (item === null) {
      return { success: true, data: undefined };
    }
    
    const parsed = JSON.parse(item) as T;
    return { success: true, data: parsed };
  } catch (error) {
    console.error(`Failed to get item from localStorage (key: ${key}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Safely set an item in localStorage with error handling
 */
export function setStorageItem<T>(key: string, value: T): StorageResult<T> {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    
    // Verify the write was successful
    const verification = localStorage.getItem(key);
    if (verification !== serialized) {
      throw new Error('Storage verification failed');
    }
    
    // Dispatch custom event for same-page synchronization
    window.dispatchEvent(new CustomEvent('localStorageChanged', {
      detail: { key, value }
    }));
    
    return { success: true, data: value };
  } catch (error) {
    console.error(`Failed to set item in localStorage (key: ${key}):`, error);
    
    // Check if quota exceeded
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      return {
        success: false,
        error: 'Storage quota exceeded. Please clear some data.'
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Safely remove an item from localStorage
 */
export function removeStorageItem(key: string): StorageResult<void> {
  try {
    localStorage.removeItem(key);
    
    // Dispatch custom event for same-page synchronization
    window.dispatchEvent(new CustomEvent('localStorageChanged', {
      detail: { key, value: null }
    }));
    
    return { success: true };
  } catch (error) {
    console.error(`Failed to remove item from localStorage (key: ${key}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate model data structure
 */
export function validateModelData(data: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!isValidObject(data)) {
    errors.push('Model data must be an object');
    return { valid: false, errors };
  }
  
  if (typeof data.provider !== 'string' || !data.provider) {
    errors.push('Model must have a valid provider string');
  }
  
  if (typeof data.model !== 'string' || !data.model) {
    errors.push('Model must have a valid model string');
  }
  
  if (typeof data.displayName !== 'string' || !data.displayName) {
    errors.push('Model must have a valid displayName string');
  }
  
  if (typeof data.providerName !== 'string' || !data.providerName) {
    errors.push('Model must have a valid providerName string');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate conversation data structure
 */
export function validateConversationData(data: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!isValidObject(data)) {
    errors.push('Conversation data must be an object');
    return { valid: false, errors };
  }
  
  if (typeof data.id !== 'string' || !data.id) {
    errors.push('Conversation must have a valid id string');
  }
  
  if (typeof data.title !== 'string') {
    errors.push('Conversation must have a title string');
  }
  
  if (!isValidArray(data.messages)) {
    errors.push('Conversation must have a messages array');
  }
  
  if (typeof data.created_at !== 'string' && !(data.created_at instanceof Date)) {
    errors.push('Conversation must have a valid created_at date');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate AI parameters data structure
 */
export function validateAIParametersData(data: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!isValidObject(data)) {
    errors.push('AI parameters must be an object');
    return { valid: false, errors };
  }
  
  if (data.temperature !== undefined && typeof data.temperature !== 'number') {
    errors.push('Temperature must be a number');
  }
  
  if (data.maxTokens !== undefined && typeof data.maxTokens !== 'number') {
    errors.push('Max tokens must be a number');
  }
  
  if (data.topP !== undefined && typeof data.topP !== 'number') {
    errors.push('Top P must be a number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get and validate model from storage
 */
export function getValidatedModel(key: string = 'selectedModel'): StorageResult<any> {
  const result = getStorageItem<any>(key);
  
  if (!result.success || !result.data) {
    return result;
  }
  
  const validation = validateModelData(result.data);
  
  if (!validation.valid) {
    console.warn(`Invalid model data in storage (key: ${key}):`, validation.errors);
    return {
      success: false,
      error: `Invalid model data: ${validation.errors.join(', ')}`
    };
  }
  
  return result;
}

/**
 * Get and validate conversations from storage
 */
export function getValidatedConversations(key: string = 'conversations'): StorageResult<any[]> {
  const result = getStorageItem<any[]>(key);
  
  if (!result.success || !result.data) {
    return result;
  }
  
  if (!isValidArray(result.data)) {
    return {
      success: false,
      error: 'Conversations data is not an array'
    };
  }
  
  // Validate each conversation
  const invalidConversations: number[] = [];
  result.data.forEach((conv, index) => {
    const validation = validateConversationData(conv);
    if (!validation.valid) {
      console.warn(`Invalid conversation at index ${index}:`, validation.errors);
      invalidConversations.push(index);
    }
  });
  
  if (invalidConversations.length > 0) {
    console.warn(`Found ${invalidConversations.length} invalid conversations, filtering them out`);
    const validConversations = result.data.filter((_, index) => !invalidConversations.includes(index));
    return { success: true, data: validConversations };
  }
  
  return result;
}

/**
 * Get and validate AI parameters from storage
 */
export function getValidatedAIParameters(key: string = 'ai-parameters'): StorageResult<any> {
  const result = getStorageItem<any>(key);
  
  if (!result.success || !result.data) {
    return result;
  }
  
  const validation = validateAIParametersData(result.data);
  
  if (!validation.valid) {
    console.warn(`Invalid AI parameters in storage (key: ${key}):`, validation.errors);
    return {
      success: false,
      error: `Invalid AI parameters: ${validation.errors.join(', ')}`
    };
  }
  
  return result;
}

/**
 * Clear all application data from localStorage
 */
export function clearAllAppData(): StorageResult<void> {
  const keysToRemove = [
    'selectedModel',
    'conversations',
    'ai-parameters',
    'settings-active-tab'
  ];
  
  const errors: string[] = [];
  
  keysToRemove.forEach(key => {
    const result = removeStorageItem(key);
    if (!result.success && result.error) {
      errors.push(`${key}: ${result.error}`);
    }
  });
  
  if (errors.length > 0) {
    return {
      success: false,
      error: `Failed to clear some items: ${errors.join(', ')}`
    };
  }
  
  return { success: true };
}

/**
 * Check if localStorage is available and working
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage usage information
 */
export function getStorageInfo(): {
  available: boolean;
  estimatedSize?: number;
  keys: string[];
} {
  const available = isStorageAvailable();
  
  if (!available) {
    return { available: false, keys: [] };
  }
  
  const keys = Object.keys(localStorage);
  let estimatedSize = 0;
  
  keys.forEach(key => {
    const item = localStorage.getItem(key);
    if (item) {
      estimatedSize += item.length + key.length;
    }
  });
  
  return {
    available: true,
    estimatedSize,
    keys
  };
}
