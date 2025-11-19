/**
 * 用户认证页面 - 登录和注册
 */
import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Loader2, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import PasswordStrength from '../components/PasswordStrength';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } | null>(null);

  const { isAuthenticated, isLoading, registerUser, loginUser } = useAuthStore();

  // 优化密码验证回调，防止无限渲染
  const handlePasswordValidation = useCallback((isValid: boolean, errors: string[], strength: 'weak' | 'medium' | 'strong') => {
    setPasswordValidation({ isValid, errors, strength });
  }, []);

  // 清除登录和账号信息
  const handleClearLoginData = () => {
    if (confirm('确定要清除所有登录和账号信息吗？这将删除所有本地存储的用户数据，包括登录状态、对话历史等。')) {
      // 清除所有localStorage数据
      localStorage.clear();
      
      // 清除表单数据
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setDisplayName('');
      setEmail('');
      setError('');
      setShowPassword(false);
      setPasswordValidation(null);
      
      alert('所有登录和账号信息已清除！');
      
      // 刷新页面以确保状态完全重置
      window.location.reload();
    }
  };

  // 如果已登录，重定向到聊天页面
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }

    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    // 注册时的额外验证
    if (!isLogin) {
      if (password.length < 6) {
        setError('密码长度不能少于6个字符');
        return;
      }
      
      // 使用密码强度验证结果
      if (passwordValidation && !passwordValidation.isValid) {
        setError(passwordValidation.errors[0] || '密码不符合要求');
        return;
      }
      
      if (confirmPassword && password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    }

    try {
      if (isLogin) {
        const result = await loginUser(username, password);
        if (!result.success) {
          setError(result.error || '登录失败');
        }
      } else {
        const result = await registerUser(username, password, confirmPassword, displayName, email);
        if (!result.success) {
          setError(result.error || '注册失败');
        }
      }
    } catch (error) {
      setError('操作失败，请重试');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md w-full max-w-md p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {isLogin ? '登录账户' : '创建账户'}
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              用户名 *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="输入用户名"
              disabled={isLoading}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码 *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                placeholder={isLogin ? "输入密码" : "设置密码（至少6位）"}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                disabled={isLoading}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            {/* 密码强度指示器（仅注册时显示） */}
            {!isLogin && password && (
              <PasswordStrength 
                password={password} 
                onValidation={handlePasswordValidation}
              />
            )}
          </div>

          {/* Confirm Password (only for registration) */}
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                确认密码 *
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="再次输入密码"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Display Name (only for registration) */}
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                显示名称
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="输入显示名称（可选）"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Email (only for registration) */}
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                邮箱地址
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="输入邮箱地址（可选）"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isLogin ? '登录中...' : '注册中...'}</span>
              </div>
            ) : (
              isLogin ? '登录' : '注册'
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setPassword('');
              setConfirmPassword('');
              setDisplayName('');
              setEmail('');
              setShowPassword(false);
            }}
            className="text-blue-600 hover:text-blue-500 text-sm"
            disabled={isLoading}
          >
            {isLogin ? '还没有账户？立即注册' : '已有账户？立即登录'}
          </button>
        </div>

        {/* Clear Login Data */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleClearLoginData}
            className="text-red-600 hover:text-red-500 text-xs underline"
            disabled={isLoading}
          >
            清除登录和账号信息
          </button>
        </div>

        {/* Info */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          💡 提示：这是一个本地化应用，你的数据存储在本地，安全可靠。
        </div>
      </div>
    </div>
  );
}