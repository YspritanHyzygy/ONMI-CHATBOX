/**
 * 用户认证状态管理 - 使用Zustand
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, AuthState } from '../types/auth';

interface AuthStore extends AuthState {
  // Actions
  login: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (userData: Partial<User>) => void;
  
  // API calls
  registerUser: (username: string, password: string, confirmPassword?: string, displayName?: string, email?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  loginUser: (username: string, password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  checkUsername: (username: string) => Promise<{ available: boolean; message?: string }>;
  fetchUser: (userId: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  validatePassword: (password: string) => { isValid: boolean; errors: string[]; strength: 'weak' | 'medium' | 'strong' };
}

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,

      // Actions
      login: (user: User) => {
        set({ user, isAuthenticated: true, isLoading: false });
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, isLoading: false });
        // 清除localStorage中的其他用户相关数据
        localStorage.removeItem('gemini_video_webui_user_id');
        localStorage.removeItem('selectedModel');
        localStorage.removeItem('ai-parameters');
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      updateUser: (userData: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...userData } });
        }
      },

      // API calls
      registerUser: async (username: string, password: string, confirmPassword?: string, displayName?: string, email?: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, confirmPassword, displayName, email }),
          });

          const data = await response.json();
          
          if (data.success) {
            get().login(data.user);
            return { success: true, message: data.message };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: '网络错误，请重试' };
        }
      },

      loginUser: async (username: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
          });

          const data = await response.json();
          
          if (data.success) {
            get().login(data.user);
            // 更新localStorage中的用户ID以保持兼容性
            localStorage.setItem('gemini_video_webui_user_id', data.user.id);
            return { success: true, message: data.message };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: '网络错误，请重试' };
        }
      },

      checkUsername: async (username: string) => {
        try {
          const response = await fetch(`/api/auth/check-username/${username}`);
          const data = await response.json();
          
          if (data.success) {
            return { available: data.available, message: data.message };
          } else {
            return { available: false, message: '检查失败，请重试' };
          }
        } catch (error) {
          return { available: false, message: '网络错误，请重试' };
        }
      },

      changePassword: async (currentPassword: string, newPassword: string, confirmPassword?: string) => {
        const user = get().user;
        if (!user) {
          return { success: false, error: '用户未登录' };
        }

        set({ isLoading: true });
        try {
          const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              userId: user.id, 
              currentPassword, 
              newPassword, 
              confirmPassword 
            }),
          });

          const data = await response.json();
          
          if (data.success) {
            set({ isLoading: false });
            return { success: true, message: data.message };
          } else {
            set({ isLoading: false });
            return { success: false, error: data.error };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: '网络错误，请重试' };
        }
      },

      validatePassword: (password: string) => {
        const errors: string[] = [];
        let strength: 'weak' | 'medium' | 'strong' = 'weak';

        // 基本长度检查
        if (password.length < 6) {
          errors.push('密码长度不能少于6个字符');
        }

        // 密码强度判断
        let score = 0;
        if (password.length >= 8) score += 1;
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;

        if (score >= 4) {
          strength = 'strong';
        } else if (score >= 2) {
          strength = 'medium';
        }

        return {
          isValid: errors.length === 0,
          errors,
          strength
        };
      },

      fetchUser: async (userId: string) => {
        try {
          const response = await fetch(`/api/auth/user/${userId}`);
          const data = await response.json();
          
          if (data.success) {
            return { success: true, user: data.user };
          } else {
            return { success: false, error: data.error };
          }
        } catch (error) {
          return { success: false, error: '网络错误，请重试' };
        }
      },
    }),
    {
      name: 'auth-storage',
      // 只持久化用户信息，不持久化loading状态
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;