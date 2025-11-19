/**
 * 用户信息头部组件 - 显示当前用户信息和登出按钮
 */
import { User, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';

interface UserHeaderProps {
  className?: string;
}

export default function UserHeader({ className = '' }: UserHeaderProps) {
  const { user, logout } = useAuthStore();

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout();
    }
  };

  return (
    <div className={`flex items-center justify-between p-4 bg-white border-b border-gray-200 ${className}`}>
      {/* 用户信息 */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
          <User className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <div className="font-medium text-gray-900">
            {user.displayName || user.username}
          </div>
          <div className="text-sm text-gray-500">
            @{user.username}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="设置"
        >
          <SettingsIcon className="w-5 h-5" />
        </Link>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="退出登录"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}