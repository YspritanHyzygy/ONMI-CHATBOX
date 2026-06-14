/**
 * 路由保护组件 - 需要登录才能访问的页面
 */
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, token, logout, validateSession } = useAuthStore();
  const location = useLocation();
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(false);

  // 检测"半登录"的脏状态：isAuthenticated=true 但 token 丢失
  // 这是 auth middleware 上线之前的遗留 auth-storage 的典型表现。
  // 这种状态下一切 API 都会 401，必须强制清空并重新登录。
  const hasValidSession = isAuthenticated && !!token;
  const isStaleSession = isAuthenticated && !token;

  useEffect(() => {
    if (isStaleSession) {
      logout();
    }
  }, [isStaleSession, logout]);

  useEffect(() => {
    if (!hasValidSession || validatedToken === token) return;

    let cancelled = false;
    setIsCheckingSession(true);
    validateSession()
      .then((valid) => {
        if (!cancelled && valid) setValidatedToken(token);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasValidSession, token, validatedToken, validateSession]);

  if (!hasValidSession) {
    // 将当前路径保存到 state，登录后可以重定向回来
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (isCheckingSession && validatedToken !== token) {
    return <div className="min-h-screen bg-background" />;
  }

  return <>{children}</>;
}
