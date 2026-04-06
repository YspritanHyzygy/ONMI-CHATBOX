import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Eye, EyeOff, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import PasswordStrength from '@/components/PasswordStrength';
import useAuthStore from '@/store/authStore';

export default function UserManagement() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading, changePassword } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showUserPasswords, setShowUserPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordValidation, setPasswordValidation] = useState<{
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'medium' | 'strong';
  } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword) {
      setPasswordError(t('auth.fillAllFields'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('auth.passwordMismatch'));
      return;
    }
    if (passwordValidation && !passwordValidation.isValid) {
      setPasswordError(t('auth.passwordTooWeak'));
      return;
    }

    try {
      const result = await changePassword(currentPassword, newPassword, confirmNewPassword);
      if (result.success) {
        setPasswordSuccess(result.message || t('auth.passwordChanged'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordValidation(null);
      } else {
        setPasswordError(result.error || t('auth.loginFailed'));
      }
    } catch {
      setPasswordError(t('auth.operationFailed'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <User className="w-6 h-6 text-primary mr-3" />
          <div>
            <CardTitle className="text-lg">{t('settings.userManagement')}</CardTitle>
            <CardDescription className="mt-1">{t('settings.userManagementDescription')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!user ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <p>{t('settings.pleaseLoginFirst')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Personal info */}
            <div>
              <h3 className="text-md font-medium text-foreground mb-4">{t('settings.personalInfo')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="username" className="mb-1 block">{t('settings.username')}</Label>
                  <Input id="username" name="username" value={user.username} disabled className="bg-muted" />
                  <p className="mt-1 text-muted-foreground text-sm">{t('settings.usernameCannotModify')}</p>
                </div>
                <div>
                  <Label htmlFor="email" className="mb-1 block">{t('settings.email')}</Label>
                  <Input id="email" name="email" type="email" value={user.email || ''} disabled className="bg-muted" />
                </div>
                <div>
                  <Label htmlFor="registrationTime" className="mb-1 block">{t('settings.registrationTime')}</Label>
                  <Input
                    id="registrationTime"
                    name="registrationTime"
                    value={new Date(user.created_at).toLocaleString()}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            </div>

            {/* Password change */}
            <Separator />
            <div>
              <div className="flex items-center mb-4">
                <Lock className="w-5 h-5 text-primary mr-2" />
                <h3 className="text-md font-medium text-foreground">{t('settings.changePassword')}</h3>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passwordSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                    {passwordSuccess}
                  </div>
                )}
                {passwordError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
                    {passwordError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="currentPassword" className="mb-1 block">
                      {t('settings.currentPassword')} *
                    </Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        name="currentPassword"
                        type={showUserPasswords ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t('settings.enterCurrentPassword')}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowUserPasswords(!showUserPasswords)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        disabled={authLoading}
                      >
                        {showUserPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="newPassword" className="mb-1 block">
                      {t('settings.newPassword')} *
                    </Label>
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type={showUserPasswords ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('settings.setNewPassword')}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="confirmNewPassword" className="mb-1 block">
                      {t('settings.confirmNewPassword')} *
                    </Label>
                    <Input
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      type={showUserPasswords ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder={t('settings.confirmNewPassword')}
                      required
                    />
                  </div>
                </div>

                {newPassword && (
                  <PasswordStrength
                    password={newPassword}
                    onValidation={(isValid, errors, strength) => {
                      setPasswordValidation({ isValid, errors, strength });
                    }}
                  />
                )}

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={authLoading || !currentPassword || !newPassword || !confirmNewPassword}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {authLoading ? t('settings.changing') : t('settings.changePasswordButton')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
