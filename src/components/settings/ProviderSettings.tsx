import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Zap, Eye, EyeOff, AlertCircle, Check, X, Star, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { convertModelIdToDisplayName } from '@/lib/model-display-names';
import { fetchWithAuth } from '@/lib/fetch';
import type { AIProvider, ProviderConfig } from './types';

interface ProviderSettingsProps {
  provider: AIProvider;
  config: ProviderConfig | undefined;
  testResult: { success: boolean; message: string } | undefined;
  testResults: Record<string, { success: boolean; message: string }>;
  testingProvider: string | null;
  showPasswords: Record<string, boolean>;
  testModels: Record<string, string>;
  fetchingModels: Record<string, boolean> | null;
  modelFetchResults: Record<string, {
    success: boolean;
    models: (string | { id?: string; name?: string; [key: string]: unknown })[];
    researchModels?: (string | { id?: string; name?: string; [key: string]: unknown })[];
    message: string;
  }>;
  saveStatus: Record<string, { status: 'idle' | 'success' | 'error'; message: string; timestamp?: number }>;
  manualSaving: Record<string, boolean>;
  updateConfig: (providerId: string, field: string, value: string | (string | { id?: string; name?: string; [key: string]: unknown })[], autoSaveEnabled?: boolean) => void;
  updateModel: (providerId: string, model: string, autoSaveEnabled?: boolean) => void;
  setAsDefault: (providerId: string) => void;
  manualSaveConfig: (providerId: string) => void;
  testConnection: (providerId: string) => void;
  testProviderConnection: (providerId: string) => void;
  fetchModels: (providerId: string) => void;
  togglePasswordVisibility: (providerId: string, fieldName: string) => void;
  setTestModels: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTestingProvider: React.Dispatch<React.SetStateAction<string | null>>;
  setTestResults: React.Dispatch<React.SetStateAction<Record<string, { success: boolean; message: string }>>>;
  getProviderConfig: (providerId: string) => ProviderConfig | undefined;
}

export default function ProviderSettings({
  provider,
  config,
  testResult,
  testResults,
  testingProvider,
  showPasswords,
  testModels,
  fetchingModels,
  modelFetchResults,
  saveStatus,
  manualSaving,
  updateConfig,
  updateModel,
  setAsDefault,
  manualSaveConfig,
  testConnection,
  testProviderConnection,
  fetchModels,
  togglePasswordVisibility,
  setTestModels,
  setTestingProvider,
  setTestResults,
  getProviderConfig,
}: ProviderSettingsProps) {
  const { t } = useTranslation();

  // 三个独立操作：拉模型 / 保存 / 测试连接（免费）
  const handleFetchModels = () => fetchModels(provider.id);
  const handleSave = () => manualSaveConfig(provider.id);
  const handleTestProvider = () => testProviderConnection(provider.id);

  // Test a specific model directly from the model row (paid path: 真的会发推理请求)
  const handleTestModel = (modelId: string) => {
    setTestModels((prev) => ({ ...prev, [provider.id]: modelId }));
    testConnection(provider.id);
  };

  const isFetching = (fetchingModels && fetchingModels[provider.id]) || false;
  const isTesting = testingProvider === provider.id;
  const isSaving = manualSaving[provider.id];

  // 必填字段缺失时禁用 Fetch / Test（Save 按钮另行处理：会显示错误而不是禁用）
  const requiredFieldMissing =
    !config ||
    (provider.id !== 'ollama' && !config?.config.api_key) ||
    (provider.id === 'ollama' && !config?.config.base_url);
  const currentSaveStatus = saveStatus[provider.id];
  const responsesTestResult = testResults[`${provider.id}-responses`];

  // Determine the most recent status to show in the unified status area
  const unifiedStatus = (() => {
    if (testResult) return { kind: 'test', success: testResult.success, message: testResult.message };
    if (responsesTestResult) return { kind: 'responses', success: responsesTestResult.success, message: responsesTestResult.message };
    if (modelFetchResults[provider.id]) {
      const r = modelFetchResults[provider.id];
      return { kind: 'fetch', success: r.success, message: r.message, models: r.models, researchModels: r.researchModels };
    }
    return null;
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">{provider.name}</CardTitle>
          <CardDescription className="mt-1">{provider.description}</CardDescription>
        </div>
        {config && (
          <Button
            variant={config.is_default ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setAsDefault(provider.id)}
            disabled={config.is_default}
          >
            {config.is_default ? t('settings.defaultService') : t('common.setDefault')}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-8">
        {/* ─── Authentication ─────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionHeader>{t('settings.sectionAuth')}</SectionHeader>

          {provider.fields.map((field) => {
            const fieldValue = config?.config[field.name] || '';
            const showPasswordKey = `${provider.id}-${field.name}`;
            const showPassword = showPasswords[showPasswordKey];

            return (
              <div key={field.name}>
                <Label htmlFor={`${provider.id}-${field.name}`} className="mb-2 block">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === 'boolean' ? (
                  <div className="flex items-center">
                    <Switch
                      checked={fieldValue === 'true'}
                      onCheckedChange={(checked) =>
                        updateConfig(provider.id, field.name, checked ? 'true' : 'false', true)
                      }
                    />
                    <span className="ml-3 text-sm text-muted-foreground">
                      {fieldValue === 'true' ? t('settings.enabled') : t('settings.disabled')}
                    </span>
                    {/* Responses API test button for OpenAI */}
                    {provider.id === 'openai' && field.name === 'use_responses_api' && fieldValue === 'true' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-3"
                        onClick={async () => {
                          const providerConfig = getProviderConfig(provider.id);
                          if (!providerConfig?.config.api_key) {
                            toast.error(t('settings.apiKeyRequired_toast'));
                            return;
                          }
                          setTestingProvider(`${provider.id}-responses`);
                          try {
                            const response = await fetchWithAuth('/api/chat', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                message: t('settings.responsesApiTestMessage'),
                                provider: 'openai',
                                model: providerConfig.model || 'gpt-4o',
                                parameters: {
                                  temperature: 0.7,
                                  maxTokens: 50,
                                  useResponsesAPI: true,
                                },
                              }),
                            });
                            const result = await response.json();
                            setTestResults((prev) => ({
                              ...prev,
                              [`${provider.id}-responses`]: {
                                success: result.success,
                                message: result.success
                                  ? t('settings.responsesApiTestSuccess', { response: result.response ? result.response.slice(0, 50) + '...' : t('settings.noResponse') })
                                  : t('settings.responsesApiTestFailed', { error: result.error || t('common.unknownError') }),
                              },
                            }));
                          } catch (error) {
                            setTestResults((prev) => ({
                              ...prev,
                              [`${provider.id}-responses`]: {
                                success: false,
                                message: t('settings.responsesApiTestFailed', { error: error instanceof Error ? error.message : t('settings.networkError') }),
                              },
                            }));
                          } finally {
                            setTestingProvider(null);
                          }
                        }}
                        disabled={testingProvider === `${provider.id}-responses`}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        {testingProvider === `${provider.id}-responses` ? t('settings.testing') : t('settings.test')}
                      </Button>
                    )}
                  </div>
                ) : field.type === 'number' ? (
                  <Input
                    id={`${provider.id}-${field.name}`}
                    name={`${provider.id}-${field.name}`}
                    type="number"
                    value={fieldValue}
                    onChange={(e) => updateConfig(provider.id, field.name, e.target.value)}
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                  />
                ) : (
                  <div className="relative">
                    <Input
                      id={`${provider.id}-${field.name}`}
                      name={`${provider.id}-${field.name}`}
                      type={field.type === 'password' && !showPassword ? 'password' : 'text'}
                      value={fieldValue}
                      onChange={(e) => updateConfig(provider.id, field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className={field.type === 'password' ? 'pr-10' : ''}
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(provider.id, field.name)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                )}
                {field.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                )}
              </div>
            );
          })}
        </section>

        {/* ─── Models ─────────────────────────────────────────────── */}
        {(provider.models.length > 0 || (provider.id === 'ollama' && modelFetchResults[provider.id]?.success && modelFetchResults[provider.id]?.models.length > 0)) && (
          <section className="space-y-3">
            <SectionHeader>{t('settings.modelsSection')}</SectionHeader>
            <ModelTable
              provider={provider}
              config={config}
              modelFetchResults={modelFetchResults}
              testModels={testModels}
              isTesting={isTesting}
              updateConfig={updateConfig}
              updateModel={updateModel}
              onTestModel={handleTestModel}
            />
          </section>
        )}

        {/* ─── Connection Test / Status ──────────────────────────── */}
        <section className="space-y-3">
          <SectionHeader>{t('settings.sectionConnection')}</SectionHeader>

          <div className="flex items-center justify-between">
            {/* Save status badge */}
            <div>
              {currentSaveStatus?.status === 'success' && (
                <Badge variant="secondary" className="bg-success/15 text-success border border-success/30">
                  <Check className="w-3 h-3 mr-1" />
                  {currentSaveStatus.message}
                </Badge>
              )}
              {currentSaveStatus?.status === 'error' && (
                <Badge variant="destructive">
                  <X className="w-3 h-3 mr-1" />
                  {currentSaveStatus.message}
                </Badge>
              )}
              {isSaving && (
                <Badge variant="outline">
                  <Save className="w-3 h-3 mr-1 animate-pulse" />
                  {t('settings.saving')}
                </Badge>
              )}
            </div>

            {/* Action buttons: Fetch Models + Save + Test Connection */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchModels}
                disabled={isFetching || requiredFieldMissing}
              >
                <Search className={cn('w-4 h-4 mr-2', isFetching && 'animate-pulse')} />
                {isFetching ? t('settings.fetching') : t('settings.fetchModels')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !config}
              >
                <Save className={cn('w-4 h-4 mr-2', isSaving && 'animate-pulse')} />
                {isSaving ? t('settings.saving') : t('common.save')}
              </Button>
              <Button
                size="sm"
                onClick={handleTestProvider}
                disabled={isTesting || requiredFieldMissing}
              >
                <Zap className={cn('w-4 h-4 mr-2', isTesting && 'animate-pulse')} />
                {isTesting ? t('settings.testing') : t('settings.testConnection')}
              </Button>
            </div>
          </div>

          {/* Unified status area */}
          {unifiedStatus && (
            <UnifiedStatusArea status={unifiedStatus} />
          )}

          {/* Deep Research models (OpenAI only, kept as-is, disabled) */}
          {provider.id === 'openai' && modelFetchResults[provider.id]?.success &&
           modelFetchResults[provider.id]?.researchModels &&
           modelFetchResults[provider.id].researchModels!.length > 0 && (
            <DeepResearchSection provider={provider} modelFetchResults={modelFetchResults} />
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Section header                                                      */
/* ------------------------------------------------------------------ */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/* ------------------------------------------------------------------ */
/* Unified status area                                                 */
/* ------------------------------------------------------------------ */

function UnifiedStatusArea({
  status,
}: {
  status: { kind: string; success: boolean; message: string; models?: (string | { id?: string; name?: string; [key: string]: unknown })[]; researchModels?: (string | { id?: string; name?: string; [key: string]: unknown })[] };
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={cn(
      'rounded-md border p-3',
      status.success ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'
    )}>
      <div className="flex items-start gap-2">
        {status.success ? (
          <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {/* 用 text-success（深绿）在 bg-success/10（浅绿）上读；
              text-success-foreground 是用来放在实心 bg-success 上的几乎白色，
              放在 /10 背景上会和背景同色看不清 */}
          <p className={cn('text-sm', status.success ? 'text-success' : 'text-destructive')}>
            {status.message}
          </p>
          {status.success && status.models && status.models.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
            >
              {showDetails ? t('settings.hideDetails') : t('settings.showDetails')}
            </button>
          )}
          {showDetails && status.models && (
            <div className="mt-2 flex flex-wrap gap-1">
              {status.models.slice(0, 20).map((model, index) => {
                const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Model ${index + 1}`;
                return (
                  <Badge key={`status-model-${index}`} variant="secondary" className="text-xs">
                    {modelName as string}
                  </Badge>
                );
              })}
              {status.models.length > 20 && (
                <Badge variant="outline" className="text-xs">
                  {t('settings.moreModels', { count: status.models.length - 20 })}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unified Model Table                                                 */
/* ------------------------------------------------------------------ */

interface ModelTableProps {
  provider: AIProvider;
  config: ProviderConfig | undefined;
  modelFetchResults: Record<string, {
    success: boolean;
    models: (string | { id?: string; name?: string; [key: string]: unknown })[];
    researchModels?: (string | { id?: string; name?: string; [key: string]: unknown })[];
    message: string;
  }>;
  testModels: Record<string, string>;
  isTesting: boolean;
  updateConfig: (providerId: string, field: string, value: string | (string | { id?: string; name?: string; [key: string]: unknown })[], autoSaveEnabled?: boolean) => void;
  updateModel: (providerId: string, model: string, autoSaveEnabled?: boolean) => void;
  onTestModel: (modelId: string) => void;
}

function ModelTable({
  provider,
  config,
  modelFetchResults,
  testModels,
  isTesting,
  updateConfig,
  updateModel,
  onTestModel,
}: ModelTableProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  // Determine which models to show
  const modelsToShow = useMemo(() => {
    let list = provider.models;
    if (provider.id === 'ollama' && modelFetchResults[provider.id]?.success) {
      list = modelFetchResults[provider.id].models;
    } else if (config?.models && config.models.length > 0) {
      const hasDynamic = config.models.some(
        (m: any) => m && typeof m === 'object' && ('id' in m || 'name' in m)
      );
      if (hasDynamic) {
        list = config.models.filter(
          (m: any) => m && typeof m === 'object' && ('id' in m || 'name' in m)
        );
      } else {
        list = config.models;
      }
    }
    return list;
  }, [provider, config, modelFetchResults]);

  const currentModels = config?.models || [];
  const defaultModelId = config?.model || '';
  const activeTestModel = testModels[provider.id] || '';

  // Filter rows by search
  const filteredModels = useMemo(() => {
    if (!search.trim()) return modelsToShow;
    const q = search.trim().toLowerCase();
    return modelsToShow.filter((model) => {
      const id = typeof model === 'string' ? model : model?.id || model?.name || '';
      const name = typeof model === 'string' ? convertModelIdToDisplayName(model) : model?.name || convertModelIdToDisplayName(model?.id || '') || '';
      return (id as string).toLowerCase().includes(q) || (name as string).toLowerCase().includes(q);
    });
  }, [modelsToShow, search]);

  // Compute visible count
  const getIsVisible = (modelId: string): boolean => {
    const existing = currentModels.find((m: any) => {
      if (typeof m === 'string') return m === modelId;
      if (m && typeof m === 'object') return m.id === modelId || m.name === modelId;
      return false;
    });
    if (existing && typeof existing === 'object' && 'visible' in existing) {
      return Boolean(existing.visible);
    }
    return true;
  };

  const visibleCount = modelsToShow.filter((m, i) => {
    const id = typeof m === 'string' ? m : m?.id || m?.name || `model-${i}`;
    return getIsVisible(id as string);
  }).length;

  const setAllVisibility = (visible: boolean) => {
    const updated = modelsToShow.map((m, i) => {
      const id = typeof m === 'string' ? m : m?.id || m?.name || `model-${i}`;
      const name = typeof m === 'string' ? m : m?.name || m?.id || `Model ${i + 1}`;
      return { id, name, visible };
    });
    updateConfig(provider.id, 'models', updated);
  };

  const setVisibility = (modelId: string, newVisible: boolean) => {
    const updated = modelsToShow.map((m, i) => {
      const mId = typeof m === 'string' ? m : m?.id || m?.name || `model-${i}`;
      const mName = typeof m === 'string' ? m : m?.name || m?.id || `Model ${i + 1}`;
      if (mId === modelId) {
        return { id: mId, name: mName, visible: newVisible };
      }
      const existing = currentModels.find((cm: any) => {
        if (typeof cm === 'string') return cm === mId;
        if (cm && typeof cm === 'object') return cm.id === mId || cm.name === mId;
        return false;
      });
      if (existing && typeof existing === 'object' && 'visible' in existing) {
        return { id: mId, name: mName, visible: existing.visible };
      }
      return { id: mId, name: mName, visible: true };
    });
    updateConfig(provider.id, 'models', updated, true);
  };

  return (
    <div className="border border-border rounded-md">
      {/* Header: search + bulk actions */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settings.searchModels')}
            className="pl-8 h-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAllVisibility(true)}>
          {t('settings.selectAll')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAllVisibility(false)}>
          {t('settings.deselectAll')}
        </Button>
      </div>

      {/* Model list */}
      <ScrollArea className="h-72">
        {filteredModels.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('settings.noModelsFound')}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredModels.map((model, index) => {
              const modelId = typeof model === 'string' ? model : model?.id || model?.name || `model-${index}`;
              const modelName = typeof model === 'string'
                ? convertModelIdToDisplayName(model)
                : model?.name || convertModelIdToDisplayName(model?.id || '') || `Model ${index + 1}`;
              const isDefault = modelId === defaultModelId;
              const isVisible = getIsVisible(modelId as string);
              const isActiveTest = activeTestModel === modelId && isTesting;

              return (
                <div
                  key={`model-row-${provider.id}-${modelId}-${index}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50"
                >
                  {/* Default star */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => updateModel(provider.id, modelId as string)}
                        className={cn(
                          'shrink-0 rounded p-1 transition-colors',
                          isDefault
                            ? 'text-warning hover:text-warning/80'
                            : 'text-muted-foreground/40 hover:text-muted-foreground'
                        )}
                      >
                        <Star className={cn('h-4 w-4', isDefault && 'fill-current')} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isDefault ? t('settings.isDefault') : t('settings.makeDefault')}
                    </TooltipContent>
                  </Tooltip>

                  {/* Model name */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1 text-sm truncate cursor-default">
                        {modelName as string}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{modelId as string}</TooltipContent>
                  </Tooltip>

                  {/* Test button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => onTestModel(modelId as string)}
                        disabled={isTesting}
                      >
                        <Zap className={cn('h-3.5 w-3.5', isActiveTest && 'animate-pulse text-primary')} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('settings.testThisModel')}</TooltipContent>
                  </Tooltip>

                  {/* Visibility switch */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Switch
                          checked={isVisible}
                          onCheckedChange={(checked) => setVisibility(modelId as string, checked)}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('settings.visibleInChat')}</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
        {t('settings.selectedModels', { selected: visibleCount, total: modelsToShow.length })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deep Research sub-section (kept disabled, "coming soon")            */
/* ------------------------------------------------------------------ */

function DeepResearchSection({
  provider,
  modelFetchResults,
}: {
  provider: AIProvider;
  modelFetchResults: Record<string, { success: boolean; models: (string | { id?: string; name?: string; [key: string]: unknown })[]; researchModels?: (string | { id?: string; name?: string; [key: string]: unknown })[]; message: string }>;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4">
      <Label className="mb-2 block">{t('settings.deepResearchModels')}</Label>
      <div className="bg-muted/50 border border-border rounded-md p-4">
        <p className="text-xs text-muted-foreground mb-3">{t('settings.featureNotSupported')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto opacity-50">
          {modelFetchResults[provider.id].researchModels!.map((model, index) => {
            const modelId = typeof model === 'string' ? model : model?.id || model?.name || `research-model-${index}`;
            const modelName = typeof model === 'string' ? model : model?.name || model?.id || `Research Model ${index + 1}`;
            return (
              <label key={`research-visibility-${provider.id}-${modelId}-${index}`} className="flex items-center space-x-2 p-2 rounded cursor-not-allowed">
                <Switch checked={false} disabled />
                <span className="text-sm text-muted-foreground truncate" title={modelName as string}>
                  {modelName as string}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{t('settings.featureComingSoon')}</div>
      </div>
    </div>
  );
}
