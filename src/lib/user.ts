/**
 * 用户管理工具函数
 * 处理用户ID的生成和存储，集成认证系统
 */

/**
 * 生成唯一的用户ID
 */
function generateUserId(): string {
  // 使用标准UUID格式，兼容数据库的uuid类型
  return crypto.randomUUID();
}

/**
 * 检查用户ID是否为有效的UUID格式
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * 获取或创建用户ID
 * 优先使用认证系统中的用户ID，如果没有则使用localStorage
 */
export function getUserId(): string {
  const STORAGE_KEY = 'gemini_video_webui_user_id';
  
  // 首先尝试从认证状态中获取用户ID
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authState = JSON.parse(authStorage);
      // Zustand persist 的数据结构是 { state: { user, isAuthenticated } }
      if (authState.state?.user?.id && authState.state?.isAuthenticated) {
        // 如果用户已登录，同步更新localStorage中的用户ID
        const authenticatedUserId = authState.state.user.id;
        localStorage.setItem(STORAGE_KEY, authenticatedUserId);
        console.log('[DEBUG] 使用认证用户ID:', authenticatedUserId);
        return authenticatedUserId;
      }
      // 也检查直接存储的情况（兼容性）
      if (authState.user?.id && authState.isAuthenticated) {
        const authenticatedUserId = authState.user.id;
        localStorage.setItem(STORAGE_KEY, authenticatedUserId);
        console.log('[DEBUG] 使用认证用户ID (直接):', authenticatedUserId);
        return authenticatedUserId;
      }
    }
  } catch (error) {
    console.warn('无法获取认证状态:', error);
  }
  
  // 如果认证系统中没有用户，使用localStorage中的用户ID
  let userId = localStorage.getItem(STORAGE_KEY);
  
  // 如果没有用户ID或者不是有效的UUID格式，则生成新的
  if (!userId || !isValidUUID(userId)) {
    userId = generateUserId();
    localStorage.setItem(STORAGE_KEY, userId);
    console.log('[DEBUG] 生成新用户ID:', userId);
  } else {
    console.log('[DEBUG] 使用localStorage用户ID:', userId);
  }
  
  return userId;
}

/**
 * 清除用户ID（用于重置用户数据）
 */
export function clearUserId(): void {
  const STORAGE_KEY = 'gemini_video_webui_user_id';
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 检查是否有有效的用户ID
 */
export function hasUserId(): boolean {
  const STORAGE_KEY = 'gemini_video_webui_user_id';
  const userId = localStorage.getItem(STORAGE_KEY);
  return !!userId && isValidUUID(userId);
}

/**
 * 检查用户是否已登录（通过认证系统）
 */
export function isUserAuthenticated(): boolean {
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authState = JSON.parse(authStorage);
      return authState.state?.isAuthenticated === true;
    }
  } catch (error) {
    console.warn('无法检查认证状态:', error);
  }
  return false;
}