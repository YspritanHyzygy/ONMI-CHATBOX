/**
 * 路由保护组件 - 需要登录才能访问的页面
 */
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    // 将当前路径保存到state中，登录后可以重定向回来
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}