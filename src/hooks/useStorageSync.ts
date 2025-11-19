/**
 * Hook for synchronizing state with localStorage
 * Addresses Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStorageItem, setStorageItem } from '../lib/storage';

export interface StorageSyncOptions<T> {
  key: string;
  defaultValue: T;
  validator?: (value: unknown) => value is T;
  onError?: (error: string) => void;
  syncAcrossTabs?: boolean;
}

/**
 * Hook to sync state with localStorage with proper error handling
 */
export function useStorageSync<T>(options: StorageSyncOptions<T>): [
  T,
  (value: T | ((prev: T) => T)) => void,
  { loading: boolean; error: string | null; sync: () => void }
] {
  const {
    key,
    defaultValue,
    validator,
    onError,
    syncAcrossTabs = true
  } = options;

  const [state, setState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialized = useRef(false);
  const isSyncing = useRef(false);

  // Load initial value from storage
  useEffect(() => {
    if (isInitialized.current) return;

    const loadFromStorage = () => {
      setLoading(true);
      const result = getStorageItem<T>(key);

      if (result.success && result.data !== undefined) {
        // Validate if validator is provided
        if (validator && !validator(result.data)) {
          const errorMsg = `Invalid data format in storage for key: ${key}`;
          setError(errorMsg);
          if (onError) onError(errorMsg);
          setState(defaultValue);
        } else {
          setState(result.data);
          setError(null);
        }
      } else if (result.error) {
        setError(result.error);
        if (onError) onError(result.error);
        setState(defaultValue);
      } else {
        // No data in storage, use default
        setState(defaultValue);
        setError(null);
      }

      setLoading(false);
      isInitialized.current = true;
    };

    loadFromStorage();
  }, [key, defaultValue, validator, onError]);

  // Sync function to manually reload from storage
  const sync = useCallback(() => {
    if (isSyncing.current) return;
    
    isSyncing.current = true;
    const result = getStorageItem<T>(key);

    if (result.success && result.data !== undefined) {
      if (validator && !validator(result.data)) {
        const errorMsg = `Invalid data format in storage for key: ${key}`;
        setError(errorMsg);
        if (onError) onError(errorMsg);
      } else {
        setState(result.data);
        setError(null);
      }
    } else if (result.error) {
      setError(result.error);
      if (onError) onError(result.error);
    }
    
    isSyncing.current = false;
  }, [key, validator, onError]);

  // Listen for storage changes (cross-tab and same-page)
  useEffect(() => {
    if (!syncAcrossTabs) return;

    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      // Prevent syncing during our own updates
      if (isSyncing.current) return;

      let changedKey: string | null = null;

      if (e instanceof StorageEvent) {
        // Cross-tab change
        changedKey = e.key;
      } else if ('detail' in e && e.detail) {
        // Same-page change
        changedKey = e.detail.key;
      }

      if (changedKey === key) {
        sync();
      }
    };

    window.addEventListener('storage', handleStorageChange as EventListener);
    window.addEventListener('localStorageChanged', handleStorageChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange as EventListener);
      window.removeEventListener('localStorageChanged', handleStorageChange as EventListener);
    };
  }, [key, sync, syncAcrossTabs]);

  // Update function that syncs to storage
  const updateState = useCallback((value: T | ((prev: T) => T)) => {
    setState(prevState => {
      const newValue = typeof value === 'function' 
        ? (value as (prev: T) => T)(prevState)
        : value;

      // Validate before saving
      if (validator && !validator(newValue)) {
        const errorMsg = `Attempted to save invalid data for key: ${key}`;
        setError(errorMsg);
        if (onError) onError(errorMsg);
        return prevState; // Don't update if invalid
      }

      // Save to storage
      const result = setStorageItem(key, newValue);

      if (!result.success && result.error) {
        setError(result.error);
        if (onError) onError(result.error);
        // Still update state even if storage fails
      } else {
        setError(null);
      }

      return newValue;
    });
  }, [key, validator, onError]);

  return [state, updateState, { loading, error, sync }];
}

/**
 * Hook for managing model selection with storage sync
 */
export function useModelStorage() {
  const validator = (value: unknown): value is any => {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.provider === 'string' &&
      typeof obj.model === 'string' &&
      typeof obj.displayName === 'string' &&
      typeof obj.providerName === 'string'
    );
  };

  return useStorageSync({
    key: 'selectedModel',
    defaultValue: null,
    validator,
    onError: (error) => console.error('Model storage error:', error)
  });
}

/**
 * Hook for managing conversations with storage sync
 */
export function useConversationsStorage() {
  const validator = (value: unknown): value is any[] => {
    if (!Array.isArray(value)) return false;
    return value.every(conv => {
      if (typeof conv !== 'object' || conv === null) return false;
      return (
        typeof conv.id === 'string' &&
        typeof conv.title === 'string' &&
        Array.isArray(conv.messages)
      );
    });
  };

  return useStorageSync({
    key: 'conversations',
    defaultValue: [],
    validator,
    onError: (error) => console.error('Conversations storage error:', error)
  });
}

/**
 * Hook for managing AI parameters with storage sync
 */
export function useAIParametersStorage() {
  const validator = (value: unknown): value is any => {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    
    // Check that numeric fields are actually numbers if they exist
    if (obj.temperature !== undefined && typeof obj.temperature !== 'number') return false;
    if (obj.maxTokens !== undefined && typeof obj.maxTokens !== 'number') return false;
    if (obj.topP !== undefined && typeof obj.topP !== 'number') return false;
    
    return true;
  };

  return useStorageSync({
    key: 'ai-parameters',
    defaultValue: {},
    validator,
    onError: (error) => console.error('AI parameters storage error:', error)
  });
}
