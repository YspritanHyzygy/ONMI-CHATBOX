import { useMemo, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';

interface PasswordStrengthProps {
  password: string;
  onValidation?: (isValid: boolean, errors: string[], strength: 'weak' | 'medium' | 'strong') => void;
}

export default function PasswordStrength({ password, onValidation }: PasswordStrengthProps) {
  const copy = useOnmiCopy();
  const validation = useMemo(() => {
    const errors: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' = 'weak';

    if (password.length < 6) {
      errors.push(copy('密码长度不能少于 6 个字符', 'Password must contain at least 6 characters'));
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
  }, [copy, password]);

  useEffect(() => {
    if (onValidation && password) {
      onValidation(validation.isValid, validation.errors, validation.strength);
    }
  }, [validation, onValidation, password]);

  if (!password) return null;

  const { errors, strength } = validation;

  const strengthConfig = {
    strong: { icon: ShieldCheck, label: copy('强', 'Strong'), variant: 'default' as const, className: 'bg-green-500/15 text-green-700 border-green-200 dark:text-green-400' },
    medium: { icon: ShieldAlert, label: copy('中等', 'Medium'), variant: 'default' as const, className: 'bg-yellow-500/15 text-yellow-700 border-yellow-200 dark:text-yellow-400' },
    weak: { icon: Shield, label: copy('弱', 'Weak'), variant: 'destructive' as const, className: 'bg-destructive/15 text-destructive border-destructive/20' },
  };
  const config = strengthConfig[strength];
  const Icon = config.icon;

  return (
    <div className="mt-2 space-y-2">
      <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
        <Icon className="h-3.5 w-3.5" />
        {copy('密码强度', 'Password strength')}: {config.label}
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
          <p className="font-medium mb-0.5">{copy('建议', 'Suggestions')}:</p>
          <ul className="space-y-0.5">
            {password.length < 8 && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />{copy('使用至少 8 个字符', 'Use at least 8 characters')}</li>}
            {!/[a-z]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />{copy('包含小写字母', 'Include a lowercase letter')}</li>}
            {!/[A-Z]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />{copy('包含大写字母', 'Include an uppercase letter')}</li>}
            {!/[0-9]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />{copy('包含数字', 'Include a number')}</li>}
            {!/[^a-zA-Z0-9]/.test(password) && <li className="flex items-center gap-1"><span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />{copy('包含特殊字符', 'Include a special character')}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
