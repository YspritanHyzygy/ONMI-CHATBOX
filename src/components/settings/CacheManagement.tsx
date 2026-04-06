import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { removeStorageItem, getStorageInfo } from '@/lib/storage';

interface CacheManagementProps {
  resetAllModelsToDefault: () => void;
  resetStatus: { status: 'idle' | 'loading' | 'success' | 'error'; message: string };
  showResetConfirm: boolean;
  setShowResetConfirm: (show: boolean) => void;
  showResetLoading: boolean;
  executeReset: () => void;
}

export default function CacheManagement({
  resetAllModelsToDefault,
  resetStatus,
  showResetConfirm,
  setShowResetConfirm,
  showResetLoading,
  executeReset,
}: CacheManagementProps) {
  const { t } = useTranslation();

  const handleClearCache = () => {
    const itemsToRemove = ['settings-active-tab'];

    let successCount = 0;
    let errorCount = 0;

    itemsToRemove.forEach((item) => {
      const result = removeStorageItem(item);
      if (result.success) successCount++;
      else {
        errorCount++;
        console.error(`Failed to remove ${item}:`, result.error);
      }
    });

    const storageInfo = getStorageInfo();
    if (storageInfo.available) {
      storageInfo.keys.forEach((key) => {
        if (
          key.includes('temp-') ||
          key.includes('cache-') ||
          key.includes('_timestamp') ||
          key.startsWith('debug-') ||
          key.startsWith('dev-')
        ) {
          const result = removeStorageItem(key);
          if (result.success) successCount++;
          else errorCount++;
        }
      });
    }

    if (errorCount > 0) {
      toast.info(t('settings.cacheClearPartial', { success: successCount, failed: errorCount }));
    } else {
      toast.success(t('settings.cacheClearSuccess'));
    }

    window.location.reload();
  };

  const handleClearAllCache = () => {
    const itemsToRemove = [
      'conversations',
      'selectedModel',
      'ai-parameters',
      'settings-active-tab',
      'theme',
      'gemini_video_webui_user_id',
    ];

    let successCount = 0;
    let errorCount = 0;

    itemsToRemove.forEach((item) => {
      const result = removeStorageItem(item);
      if (result.success) successCount++;
      else {
        errorCount++;
        console.error(`Failed to remove ${item}:`, result.error);
      }
    });

    const storageInfo = getStorageInfo();
    if (storageInfo.available) {
      storageInfo.keys.forEach((key) => {
        if (
          key.includes('temp-') ||
          key.includes('cache-') ||
          key.includes('_timestamp') ||
          key.startsWith('debug-') ||
          key.startsWith('dev-') ||
          key.includes('session-') ||
          key.includes('scroll-') ||
          key.includes('state-') ||
          key.includes('form-')
        ) {
          const result = removeStorageItem(key);
          if (result.success) successCount++;
          else errorCount++;
        }
      });
    }

    if (errorCount > 0) {
      toast.info(t('settings.deepClearPartial', { success: successCount, failed: errorCount }));
    } else {
      toast.success(t('settings.deepClearSuccess'));
    }

    window.location.reload();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <Trash2 className="w-6 h-6 text-warning mr-3" />
          <div>
            <CardTitle className="text-lg">{t('settings.cacheManagement')}</CardTitle>
            <CardDescription className="mt-1">{t('settings.cacheManagementDesc')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Warning */}
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-warning-foreground">{t('settings.cacheWarningTitle')}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {t('settings.cacheWarningText')}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Normal cache clear */}
          <div className="border border-border rounded-lg p-6 group relative">
            <div className="flex items-center mb-4">
              <RefreshCw className="w-5 h-5 text-primary mr-2" />
              <h4 className="font-medium text-foreground">{t('settings.normalClear')}</h4>
              <div className="ml-auto relative">
                <AlertCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                <div className="absolute right-0 top-6 w-64 bg-popover text-popover-foreground text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-300 pointer-events-none z-10 border border-border shadow-md">
                  <div className="mb-2">
                    <strong>{t('settings.tooltipCleanContent')}</strong><br />
                    {t('settings.normalClearTooltipContent')}
                  </div>
                  <div>
                    <strong>{t('settings.tooltipRetainContent')}</strong><br />
                    {t('settings.normalClearTooltipRetained')}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.normalClearDesc')}
            </p>
            <Button onClick={handleClearCache} className="w-full">
              {t('settings.normalClearButton')}
            </Button>
          </div>

          {/* Deep cache clear */}
          <div className="border border-destructive/30 rounded-lg p-6 group relative">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-5 h-5 text-destructive mr-2" />
              <h4 className="font-medium text-foreground">{t('settings.deepClear')}</h4>
              <div className="ml-auto relative">
                <AlertCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                <div className="absolute right-0 top-6 w-64 bg-popover text-popover-foreground text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-300 pointer-events-none z-10 border border-border shadow-md">
                  <div className="mb-2">
                    <strong>{t('settings.tooltipCleanContent')}</strong><br />
                    {t('settings.deepClearTooltipContent')}
                  </div>
                  <div className="mb-2">
                    <strong>{t('settings.tooltipRetainContent')}</strong><br />
                    {t('settings.deepClearTooltipRetained')}
                  </div>
                  <div className="text-warning">
                    <strong>{t('settings.deepClearTooltipWarning')}</strong>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.deepClearDesc')}
            </p>
            <Button variant="destructive" onClick={handleClearAllCache} className="w-full">
              {t('settings.deepClearButton')}
            </Button>
          </div>
        </div>

        {/* Cache status */}
        <div className="bg-muted/50 rounded-lg p-6">
          <h4 className="font-medium text-foreground mb-4">{t('settings.currentCacheStatus')}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <CacheStatusRow label={t('settings.cacheConversationHistory')} storageKey="conversations" />
              <CacheStatusRow label={t('settings.cacheModelSelection')} storageKey="selectedModel" />
              <CacheStatusRow label={t('settings.cacheAiParameters')} storageKey="ai-parameters" />
            </div>
            <div className="space-y-2">
              <CacheStatusRow label={t('settings.cacheSettingsTab')} storageKey="settings-active-tab" />
              <CacheStatusRow
                label={t('settings.cacheLanguageSetting')}
                storageKey="i18nextLng"
                renderValue={(val) => val ? (val === 'zh' ? t('common.chinese') : 'English') : t('common.default')}
                activeColor="text-primary"
              />
              <CacheStatusRow
                label={t('settings.cacheLoginStatus')}
                storageKey="auth-storage"
                renderValue={(val) => val ? t('settings.cacheLoggedIn') : t('settings.cacheNotLoggedIn')}
              />
            </div>
          </div>
        </div>

        {/* ─── Advanced: Reset Models ────────────────────────────── */}
        <Separator />
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t('settings.advanced')}
          </h4>
          <div className="border border-destructive/30 rounded-lg p-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h5 className="text-sm font-medium text-foreground mb-1">{t('settings.resetModels')}</h5>
              <p className="text-xs text-muted-foreground">{t('settings.resetModelsDesc')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAllModelsToDefault}
              disabled={resetStatus.status === 'loading'}
              className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0"
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', resetStatus.status === 'loading' && 'animate-spin')} />
              {resetStatus.status === 'loading' ? t('common.loading') : t('settings.resetModels')}
            </Button>
          </div>
        </div>

        {/* Confirm dialog */}
        <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('settings.confirmReset')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('settings.confirmResetMessage')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeReset}
                className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              >
                {t('settings.confirmReset')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Loading dialog */}
        <AlertDialog open={showResetLoading}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="sr-only">{t('settings.resettingModelsTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-destructive mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t('settings.resettingModelsTitle')}</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    {resetStatus.message}
                  </p>
                  {resetStatus.status === 'success' && (
                    <div className="mt-3 flex items-center text-success">
                      <Check className="w-5 h-5 mr-2" />
                      <span className="text-sm font-medium">{t('settings.resetComplete')}</span>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function CacheStatusRow({
  label,
  storageKey,
  renderValue,
  activeColor = 'text-success',
}: {
  label: string;
  storageKey: string;
  renderValue?: (val: string | null) => string;
  activeColor?: string;
}) {
  const { t } = useTranslation();
  const val = localStorage.getItem(storageKey);
  const hasValue = val !== null;

  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className={hasValue ? activeColor : 'text-muted-foreground/50'}>
        {renderValue ? renderValue(val) : (hasValue ? t('settings.cacheStored') : t('settings.cacheNoData'))}
      </span>
    </div>
  );
}
