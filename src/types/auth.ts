/**
 * 用户认证相关的类型定义
 */

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatar?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  confirmPassword?: string;
  displayName?: string;
  email?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  message?: string;
  error?: string;
}

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}