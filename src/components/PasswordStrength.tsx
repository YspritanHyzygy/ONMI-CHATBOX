import { useMemo, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PasswordStrengthProps {
  password: string;
  onValidation?: (isValid: boolean, errors: string[], strength: 'weak' | 'medium' | 'strong') => void;
}

export default function PasswordStrength({ password, onValidation }: PasswordStrengthProps) {
  const validation = useMemo(() => {
    const errors: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' = 'weak';

    if (password.length < 6) {
      errors.push('密码长度不能少于6个字符');
    }

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;

    if (score >= 4) strength = 'strong';
    else if (score >= 2) strength = 'medium';

    return { isValid: errors.length === 0, errors, strength };
  }, [password]);

  useEffect(() => {
    if (onValidation && password) {
      onValidation(validation.isValid, validation.errors, validation.strength);
    }
  }, [validation, onValidation, password]);

  if (!password) return null;

  const { errors, strength } = validation;

  const strengthConfig = {
    strong: { icon: ShieldCheck, label: '强', variant: 'default' as const, className: 'bg-green-500/15 text-green-700 border-green-200 dark:text-green-400' },
    medium: { icon: ShieldAlert, label: '中等', variant: 'default' as const, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-200 dark:text-yellow-400' },
    weak: { icon: Shield, label: '弱', variant: 'destructive' as const, className: 'bg-destructive/15 text-destructive border-destructive/20' },
  };
  const config = strengthConfig[strength];
  const Icon = config.icon;

  return (
    <div className="mt-2 space-y-2">
      <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
        <Icon className="h-3.5 w-3.5" />
        密码强度：{config.label}
      </Badge>

      {errors.length > 0 && (
        <ul className="text-xs text-destructive space-y-0.5">
          {errors.map((error, index) => (
            <li key={index} className="flex items-center gap-1">
              <span className="w-1 h-1 bg-destructive rounded-full" />
              {error}
            </li>
          ))}
        </ul>
      )}

      {password.length > 0 && strength !== 'strong' && (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-0.5">建议：</p>
          <ul className="space-y-0.5">
            {password.length < 8 && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />使用至少8个字符</li>}
            {!/[a-z]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />包含小写字母</li>}
            {!/[A-Z]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />包含大写字母</li>}
            {!/[0-9]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />包含数字</li>}
            {!/[^a-zA-Z0-9]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />包含特殊字符</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
