import { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Loader2, Eye, EyeOff, Info } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '@/store/authStore';
import PasswordStrength from '@/components/PasswordStrength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';

export default function AuthPage() {
  const { t } = useTranslation();
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

  const handlePasswordValidation = useCallback((isValid: boolean, errors: string[], strength: 'weak' | 'medium' | 'strong') => {
    setPasswordValidation({ isValid, errors, strength });
  }, []);

  const handleClearLoginData = () => {
    localStorage.clear();
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setEmail('');
    setError('');
    setShowPassword(false);
    setPasswordValidation(null);
    toast.success(t('auth.dataCleared', { defaultValue: 'All login data cleared' }));
    window.location.reload();
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError(t('auth.usernameRequired', { defaultValue: '请输入用户名' })); return; }
    if (!password.trim()) { setError(t('auth.passwordRequired', { defaultValue: '请输入密码' })); return; }

    if (!isLogin) {
      if (password.length < 6) { setError(t('auth.passwordTooShort', { defaultValue: '密码长度不能少于6个字符' })); return; }
      if (passwordValidation && !passwordValidation.isValid) { setError(passwordValidation.errors[0] || t('auth.passwordInvalid', { defaultValue: '密码不符合要求' })); return; }
      if (confirmPassword && password !== confirmPassword) { setError(t('auth.passwordMismatch', { defaultValue: '两次输入的密码不一致' })); return; }
    }

    try {
      if (isLogin) {
        const result = await loginUser(username, password);
        if (!result.success) setError(result.error || t('auth.loginFailed', { defaultValue: '登录失败' }));
      } else {
        const result = await registerUser(username, password, confirmPassword, displayName, email);
        if (!result.success) setError(result.error || t('auth.registerFailed', { defaultValue: '注册失败' }));
      }
    } catch {
      setError(t('auth.operationFailed', { defaultValue: '操作失败，请重试' }));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <Avatar className="h-12 w-12 mx-auto">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl">
            {isLogin ? t('auth.login', { defaultValue: '登录账户' }) : t('auth.register', { defaultValue: '创建账户' })}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? t('auth.loginDescription', { defaultValue: '登录以继续使用' })
              : t('auth.registerDescription', { defaultValue: '创建新账户开始使用' })
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username', { defaultValue: '用户名' })} *</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder', { defaultValue: '输入用户名' })}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password', { defaultValue: '密码' })} *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? t('auth.passwordPlaceholder', { defaultValue: '输入密码' }) : t('auth.setPasswordPlaceholder', { defaultValue: '设置密码（至少6位）' })}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {!isLogin && password && (
                <PasswordStrength password={password} onValidation={handlePasswordValidation} />
              )}
            </div>

            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('auth.confirmPassword', { defaultValue: '确认密码' })} *</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.confirmPasswordPlaceholder', { defaultValue: '再次输入密码' })}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">{t('auth.displayName', { defaultValue: '显示名称' })}</Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('auth.displayNamePlaceholder', { defaultValue: '输入显示名称（可选）' })}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email', { defaultValue: '邮箱地址' })}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder', { defaultValue: '输入邮箱地址（可选）' })}
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLogin ? t('auth.loggingIn', { defaultValue: '登录中...' }) : t('auth.registering', { defaultValue: '注册中...' })}
                </span>
              ) : (
                isLogin ? t('auth.loginButton', { defaultValue: '登录' }) : t('auth.registerButton', { defaultValue: '注册' })
              )}
            </Button>
          </form>

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
              className="text-sm text-primary hover:text-primary/80 transition-colors"
              disabled={isLoading}
            >
              {isLogin
                ? t('auth.switchToRegister', { defaultValue: '还没有账户？立即注册' })
                : t('auth.switchToLogin', { defaultValue: '已有账户？立即登录' })
              }
            </button>
          </div>

          <div className="mt-3 text-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="text-xs text-destructive hover:text-destructive/80 underline" disabled={isLoading}>
                  {t('auth.clearData', { defaultValue: '清除登录和账号信息' })}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('auth.clearDataTitle', { defaultValue: '清除所有数据？' })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('auth.clearDataDescription', { defaultValue: '这将删除所有本地存储的用户数据，包括登录状态、对话历史等。此操作不可撤销。' })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearLoginData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t('common.confirm', { defaultValue: 'Confirm' })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('auth.localStorageInfo', { defaultValue: '这是一个本地化应用，你的数据存储在本地，安全可靠。' })}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
