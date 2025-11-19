/**
 * 密码强度指示器组件
 */
import { useMemo, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

interface PasswordStrengthProps {
  password: string;
  onValidation?: (isValid: boolean, errors: string[], strength: 'weak' | 'medium' | 'strong') => void;
}

export default function PasswordStrength({ password, onValidation }: PasswordStrengthProps) {
  // 使用 useMemo 缓存密码验证结果
  const validation = useMemo(() => {
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

    const isValid = errors.length === 0;
    return { isValid, errors, strength };
  }, [password]);

  // 使用 useEffect 触发回调，避免在渲染过程中调用
  useEffect(() => {
    if (onValidation && password) {
      onValidation(validation.isValid, validation.errors, validation.strength);
    }
  }, [validation, onValidation, password]);

  if (!password) {
    return null;
  }

  const { errors, strength } = validation;

  const getStrengthColor = () => {
    switch (strength) {
      case 'strong': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'weak': return 'text-red-600';
      default: return 'text-gray-400';
    }
  };

  const getStrengthBg = () => {
    switch (strength) {
      case 'strong': return 'bg-green-100 border-green-200';
      case 'medium': return 'bg-yellow-100 border-yellow-200';
      case 'weak': return 'bg-red-100 border-red-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const getStrengthIcon = () => {
    switch (strength) {
      case 'strong': return <ShieldCheck className="w-4 h-4" />;
      case 'medium': return <ShieldAlert className="w-4 h-4" />;
      case 'weak': return <Shield className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getStrengthText = () => {
    switch (strength) {
      case 'strong': return '强';
      case 'medium': return '中等';
      case 'weak': return '弱';
      default: return '未知';
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {/* 强度指示器 */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded border ${getStrengthBg()}`}>
        <div className={getStrengthColor()}>
          {getStrengthIcon()}
        </div>
        <span className={`text-sm font-medium ${getStrengthColor()}`}>
          密码强度：{getStrengthText()}
        </span>
      </div>

      {/* 错误列表 */}
      {errors.length > 0 && (
        <ul className="text-sm text-red-600 space-y-1">
          {errors.map((error, index) => (
            <li key={index} className="flex items-center gap-1">
              <span className="w-1 h-1 bg-red-600 rounded-full"></span>
              {error}
            </li>
          ))}
        </ul>
      )}

      {/* 建议 */}
      {password.length > 0 && strength !== 'strong' && (
        <div className="text-sm text-gray-600">
          <p className="font-medium mb-1">建议：</p>
          <ul className="space-y-1">
            {password.length < 8 && (
              <li className="flex items-center gap-1">
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                使用至少8个字符
              </li>
            )}
            {!/[a-z]/.test(password) && (
              <li className="flex items-center gap-1">
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                包含小写字母
              </li>
            )}
            {!/[A-Z]/.test(password) && (
              <li className="flex items-center gap-1">
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                包含大写字母
              </li>
            )}
            {!/[0-9]/.test(password) && (
              <li className="flex items-center gap-1">
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                包含数字
              </li>
            )}
            {!/[^a-zA-Z0-9]/.test(password) && (
              <li className="flex items-center gap-1">
                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                包含特殊字符
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}