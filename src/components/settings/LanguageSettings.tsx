import { useTranslation } from 'react-i18next';
import { Globe, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LanguageSettingsProps {
  loadConfigs: () => void;
}

export default function LanguageSettings({ loadConfigs }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation();

  const changeLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    loadConfigs();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <Globe className="w-6 h-6 text-primary mr-3" />
          <div>
            <CardTitle className="text-lg">{t('settings.languageSettings')}</CardTitle>
            <CardDescription className="mt-1">{t('settings.selectLanguage')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <Label className="mb-3 block">{t('common.language')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => changeLanguage('zh')}
              className={cn(
                'p-4 border-2 rounded-lg text-left transition-all duration-200',
                i18n.language === 'zh'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-muted-foreground text-foreground',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{t('common.chinese')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t('settings.simplifiedChinese')}</p>
                </div>
                {i18n.language === 'zh' && (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </div>
            </button>

            <button
              onClick={() => changeLanguage('en')}
              className={cn(
                'p-4 border-2 rounded-lg text-left transition-all duration-200',
                i18n.language === 'en'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:border-muted-foreground text-foreground',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{t('common.english')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">English</p>
                </div>
                {i18n.language === 'en' && (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </div>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>{t('common.language')}:</strong> {i18n.language === 'zh' ? t('common.chinese') : 'English'}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {t('settings.languageNote')}
            </p>
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t('settings.refreshAfterLanguageChange')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t('settings.refreshPage')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
