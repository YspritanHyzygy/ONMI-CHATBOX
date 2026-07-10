import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import PasswordStrength from '@/components/PasswordStrength';
import { OnmiLogo } from '@/components/onmi/OnmiPrimitives';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';
import useAuthStore from '@/store/authStore';

export default function AuthPage() {
  const t = useOnmiCopy();
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

  const clearLocalData = () => {
    const ok = window.confirm(t(
      '清除当前浏览器中的登录状态与缓存？服务器上的会话历史不会被删除。',
      'Clear sign-in state and cache in this browser? Server conversation history will not be deleted.',
    ));
    if (!ok) return;
    localStorage.clear();
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setEmail('');
    setError('');
    setShowPassword(false);
    setPasswordValidation(null);
    toast.success(t('浏览器登录状态与缓存已清理', 'Browser sign-in state and cache cleared'));
    window.location.reload();
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim()) {
      setError(t('请输入用户名', 'Please enter a username'));
      return;
    }
    if (!password.trim()) {
      setError(t('请输入密码', 'Please enter a password'));
      return;
    }
    if (!isLogin) {
      if (password.length < 6) {
        setError(t('密码长度不能少于 6 个字符', 'Password must be at least 6 characters'));
        return;
      }
      if (passwordValidation && !passwordValidation.isValid) {
        setError(passwordValidation.errors[0] || t('密码不符合要求', 'Password does not meet requirements'));
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setError(t('两次输入的密码不一致', 'Passwords do not match'));
        return;
      }
    }

    try {
      const result = isLogin
        ? await loginUser(username, password)
        : await registerUser(username, password, confirmPassword, displayName, email);
      if (!result.success) {
        setError(result.error || (isLogin ? t('登录失败', 'Login failed') : t('注册失败', 'Registration failed')));
      }
    } catch {
      setError(t('操作失败，请重试', 'Operation failed, please try again'));
    }
  };

  const bootLines = [
    ['[ -- ]', t('等待本地账户身份', 'await local account identity')],
    ['[ -- ]', t('登录后验证持久会话', 'verify persistent session after sign-in')],
    ['[ -- ]', t('Provider 状态仅在配置或测试后确定', 'provider status is known only after configuration or testing')],
    ['[ -- ]', t('会话历史保存在本机 JSON 数据库', 'session history is stored in the local JSON database')],
    ['[WARN]', t('API Key 当前以明文保存在本机数据库', 'API keys are currently stored in plaintext in the local database')],
  ];

  return (
    <main className="onmi onmi-auth gridbg">
      <section className="onmi-auth-left">
        <OnmiLogo size={22} />
        <div className="onmi-boot-log onmi-mono">
          {bootLines.map(([tag, line]) => (
            <div key={`${tag}-${line}`}>
              <span className={tag === '[WARN]' ? 'warn' : tag === '[ -- ]' ? 'off' : 'ok'}>{tag}</span>
              <span>{line}</span>
            </div>
          ))}
          <div className="onmi-auth-prompt">
            <span>$</span>
            <b>onmi auth {isLogin ? 'login' : 'init'}</b>
            <i className="onmi-caret" />
          </div>
        </div>
        <div className="onmi-auth-foot onmi-mono">
          <span>ONMI · CHATBOX · v0.1.0</span>
          <span>self-hosted · local-first</span>
        </div>
      </section>

      <section className="onmi-auth-card">
        <div className="onmi-section-label">{isLogin ? 'AUTH · 01 · LOGIN' : 'AUTH · 02 · REGISTER'}</div>
        <h1>{isLogin ? t('欢迎回来。', 'Welcome back.') : t('创建你的工作站', 'Create a workstation')}</h1>
        <p>
          {isLogin
            ? t('账户与历史保存在这台服务器；聊天内容会发送给你配置的 Provider。', 'Your account and history stay on this server; chat content is sent to providers you configure.')
            : t('创建一个仅供当前自托管实例使用的本地账号。', 'Create a local account for this self-hosted instance.')}
        </p>

        <div className="onmi-auth-note">
          <KeyRound size={13} />
          <span>{t('登录后需配置至少 1 个 Provider 的 API Key 才能聊天。', 'Configure at least one provider API key after login to chat.')}</span>
        </div>

        {error && <div className="onmi-auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="onmi-auth-form">
          <ConsoleField
            label="USERNAME"
            value={username}
            onChange={setUsername}
            placeholder={t('输入用户名', 'Enter username')}
            suffix="@onmi"
            disabled={isLoading}
          />
          <ConsoleField
            label="PASSPHRASE"
            value={password}
            onChange={setPassword}
            placeholder={isLogin ? t('输入密码', 'Enter password') : t('设置密码，至少 6 位', 'Set password, 6+ characters')}
            type={showPassword ? 'text' : 'password'}
            disabled={isLoading}
            suffix={
              <button type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
          {!isLogin && password && (
            <PasswordStrength password={password} onValidation={handlePasswordValidation} />
          )}
          {!isLogin && (
            <>
              <ConsoleField
                label="CONFIRM"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t('再次输入密码', 'Confirm password')}
                type={showPassword ? 'text' : 'password'}
                disabled={isLoading}
              />
              <ConsoleField
                label="DISPLAY NAME"
                value={displayName}
                onChange={setDisplayName}
                placeholder={t('显示名称，可选', 'Display name, optional')}
                disabled={isLoading}
              />
              <ConsoleField
                label="EMAIL"
                value={email}
                onChange={setEmail}
                placeholder={t('邮箱，可选', 'Email, optional')}
                type="email"
                disabled={isLoading}
              />
            </>
          )}

          <div className="onmi-auth-check" role="note">
            <span><KeyRound size={10} /></span>
            {t('请仅在可信设备上保存 Provider API Key；当前版本尚未提供主密码加密。', 'Save provider API keys only on a trusted device; master-password encryption is not available yet.')}
          </div>

          <button type="submit" className="onmi-btn primary onmi-auth-submit" disabled={isLoading}>
            {isLoading
              ? t('处理中...', 'Processing...')
              : isLogin
                ? t('登入控制台', 'Enter console')
                : t('初始化工作站', 'Initialize workstation')}
            <ArrowRight size={14} />
          </button>
        </form>

        <div className="onmi-auth-switch">
          {isLogin ? t('还没有账号？', 'No account yet?') : t('已有账号？', 'Have an account?')}{' '}
          <button
            type="button"
            onClick={() => {
              setIsLogin((login) => !login);
              setError('');
              setPassword('');
              setConfirmPassword('');
            }}
            disabled={isLoading}
          >
            {isLogin ? t('注册', 'Register') : t('登录', 'Sign in')}
          </button>
        </div>

        <button type="button" className="onmi-auth-clear" onClick={clearLocalData} disabled={isLoading}>
          {t('清除本地登录数据', 'Clear local login data')}
        </button>
      </section>
    </main>
  );
}

interface ConsoleFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
  suffix?: ReactNode;
}

function ConsoleField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  suffix,
}: ConsoleFieldProps) {
  return (
    <label className="onmi-console-field">
      <span className="onmi-mono">{label}</span>
      <div>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          disabled={disabled}
          autoComplete={type === 'password' ? 'current-password' : 'off'}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}
