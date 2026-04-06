import { useState, useEffect, useCallback } from 'react';
import { Sliders, RotateCcw, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getValidatedAIParameters, setStorageItem } from '../lib/storage';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type AIProviderType = 'openai' | 'claude' | 'gemini' | 'xai' | 'ollama';

interface AIParameters {
  temperature: number;
  maxTokens?: number;
  topP: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  useResponsesAPI?: boolean;
  researchTools?: {
    webSearch: boolean;
    codeInterpreter: boolean;
    fileSearch: boolean;
  };
  background?: boolean;
}

interface AIParametersPanelProps {
  onParametersChange: (params: AIParameters) => void;
  className?: string;
  selectedModel?: { provider?: string; model?: string } | null;
}

interface ProviderLimits {
  temperature: { min: number; max: number; recommended: number };
  maxTokens: { min: number; max: number; default: number };
  topP: { min: number; max: number; default: number };
  topK?: { min: number; max: number; default: number };
  frequencyPenalty?: { min: number; max: number; default: number };
  presencePenalty?: { min: number; max: number; default: number };
  repetitionPenalty?: { min: number; max: number; default: number };
}

const FALLBACK_LIMITS: Record<string, ProviderLimits> = {
  openai: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 4096, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    frequencyPenalty: { min: -2.0, max: 2.0, default: 0.0 },
    presencePenalty: { min: -2.0, max: 2.0, default: 0.0 },
  },
  claude: {
    temperature: { min: 0.0, max: 1.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 8192, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    topK: { min: 1, max: 500, default: 5 },
  },
  gemini: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 65536, default: 8192 },
    topP: { min: 0.0, max: 1.0, default: 0.95 },
    topK: { min: 1, max: 40, default: 20 },
  },
  xai: {
    temperature: { min: 0.0, max: 1.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 4096, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    frequencyPenalty: { min: -2.0, max: 2.0, default: 0.0 },
    presencePenalty: { min: -2.0, max: 2.0, default: 0.0 },
  },
  ollama: {
    temperature: { min: 0.0, max: 2.0, recommended: 0.7 },
    maxTokens: { min: 1, max: 65536, default: 4000 },
    topP: { min: 0.0, max: 1.0, default: 1.0 },
    topK: { min: 1, max: 100, default: 40 },
    repetitionPenalty: { min: 0.0, max: 2.0, default: 1.1 },
  }
};

const DEFAULT_PARAMS: AIParameters = {
  temperature: 0.7,
  maxTokens: undefined,
  topP: 1.0,
  topK: undefined,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  repetitionPenalty: undefined,
  useResponsesAPI: false,
  researchTools: { webSearch: true, codeInterpreter: true, fileSearch: true },
  background: true,
};

const isResearchModel = (model?: string): boolean => {
  if (!model) return false;
  const m = model.toLowerCase();
  return m.includes('research') || m.includes('o3-deep-research') || m.includes('o4-mini-deep-research');
};

export default function AIParametersPanel({ onParametersChange, className = '', selectedModel }: AIParametersPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [parameters, setParameters] = useState<AIParameters>(DEFAULT_PARAMS);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [currentLimits, setCurrentLimits] = useState<ProviderLimits>(
    selectedModel?.provider ? FALLBACK_LIMITS[selectedModel.provider] || FALLBACK_LIMITS.openai : FALLBACK_LIMITS.openai
  );

  // Close the popover when the viewport crosses the md breakpoint —
  // otherwise the floating panel keeps its old anchor coordinates and
  // ends up "stuck" in the wrong place after a resize.
  useEffect(() => {
    if (!open) return;
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = () => setOpen(false);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [open]);

  const validateParameters = useCallback((params: AIParameters) => {
    const errors: string[] = [];
    const p = selectedModel?.provider || 'AI';

    if (params.temperature < currentLimits.temperature.min || params.temperature > currentLimits.temperature.max) {
      errors.push(`${p} Temperature: ${currentLimits.temperature.min}-${currentLimits.temperature.max}`);
    }
    if (params.maxTokens !== undefined &&
        (params.maxTokens < currentLimits.maxTokens.min || params.maxTokens > currentLimits.maxTokens.max)) {
      errors.push(`${p} MaxTokens: ${currentLimits.maxTokens.min}-${currentLimits.maxTokens.max.toLocaleString()}`);
    }
    if (params.topP < currentLimits.topP.min || params.topP > currentLimits.topP.max) {
      errors.push(`${p} TopP: ${currentLimits.topP.min}-${currentLimits.topP.max}`);
    }
    if (selectedModel?.provider === 'claude' &&
        params.temperature !== currentLimits.temperature.recommended &&
        params.topP !== currentLimits.topP.default) {
      errors.push(t('parameters.claudeWarning'));
    }

    setValidationErrors(errors);
  }, [currentLimits, selectedModel?.provider, t]);

  const loadModelLimits = useCallback(async (provider: AIProviderType, modelId?: string) => {
    try {
      const response = await fetch(`/api/model-limits/${provider}${modelId ? `/${modelId}` : ''}`);
      if (response.ok) {
        const entry = await response.json();
        const limits: ProviderLimits = {
          temperature: {
            min: entry.limits?.temperature?.min ?? 0,
            max: entry.limits?.temperature?.max ?? 2,
            recommended: entry.limits?.temperature?.default ?? 1
          },
          maxTokens: {
            min: entry.limits?.maxTokens?.min ?? 1,
            max: entry.limits?.maxTokens?.max ?? 4096,
            default: entry.limits?.maxTokens?.default ?? 1024
          },
          topP: {
            min: entry.limits?.topP?.min ?? 0,
            max: entry.limits?.topP?.max ?? 1,
            default: entry.limits?.topP?.default ?? 1
          },
          topK: entry.limits?.topK ? {
            min: entry.limits.topK.min ?? 1,
            max: entry.limits.topK.max ?? 100,
            default: entry.limits.topK.default ?? 40
          } : undefined,
          frequencyPenalty: entry.limits?.frequencyPenalty ? {
            min: entry.limits.frequencyPenalty.min ?? -2,
            max: entry.limits.frequencyPenalty.max ?? 2,
            default: entry.limits.frequencyPenalty.default ?? 0
          } : (FALLBACK_LIMITS[provider]?.frequencyPenalty || undefined),
          presencePenalty: entry.limits?.presencePenalty ? {
            min: entry.limits.presencePenalty.min ?? -2,
            max: entry.limits.presencePenalty.max ?? 2,
            default: entry.limits.presencePenalty.default ?? 0
          } : (FALLBACK_LIMITS[provider]?.presencePenalty || undefined),
          repetitionPenalty: entry.limits?.repetitionPenalty ? {
            min: entry.limits.repetitionPenalty.min ?? 0,
            max: entry.limits.repetitionPenalty.max ?? 2,
            default: entry.limits.repetitionPenalty.default ?? 1.1
          } : undefined
        };
        setCurrentLimits(limits);
      } else {
        throw new Error('API error');
      }
    } catch {
      setCurrentLimits(FALLBACK_LIMITS[provider] || FALLBACK_LIMITS.openai);
    }
  }, []);

  useEffect(() => {
    const result = getValidatedAIParameters('ai-parameters');
    if (result.success && result.data) {
      setParameters(result.data);
      validateParameters(result.data);
      onParametersChange(result.data);
    } else {
      onParametersChange(DEFAULT_PARAMS);
    }
  }, [onParametersChange]);

  useEffect(() => {
    if (selectedModel?.provider) {
      loadModelLimits(selectedModel.provider as AIProviderType, selectedModel.model);
    }
  }, [selectedModel?.provider, selectedModel?.model, loadModelLimits]);

  useEffect(() => {
    validateParameters(parameters);
  }, [currentLimits, validateParameters, parameters]);

  const updateParameter = (key: keyof AIParameters, value: number | undefined | boolean | AIParameters['researchTools']) => {
    const newParams = { ...parameters, [key]: value };
    setParameters(newParams);
    validateParameters(newParams);
    onParametersChange(newParams);
    const result = setStorageItem('ai-parameters', newParams);
    if (!result.success) console.error('Failed to save AI parameters:', result.error);
  };

  const updateResearchTool = (toolName: keyof NonNullable<AIParameters['researchTools']>, enabled: boolean) => {
    const currentTools = parameters.researchTools || { webSearch: true, codeInterpreter: true, fileSearch: true };
    updateParameter('researchTools', { ...currentTools, [toolName]: enabled });
  };

  const resetToDefaults = () => {
    const providerDefaults: AIParameters = {
      temperature: currentLimits.temperature.recommended,
      maxTokens: undefined,
      topP: currentLimits.topP.default,
      topK: currentLimits.topK?.default,
      frequencyPenalty: currentLimits.frequencyPenalty?.default || 0,
      presencePenalty: currentLimits.presencePenalty?.default || 0,
      repetitionPenalty: currentLimits.repetitionPenalty?.default,
      useResponsesAPI: false,
      researchTools: { webSearch: true, codeInterpreter: true, fileSearch: true },
      background: isResearchModel(selectedModel?.model),
    };
    setParameters(providerDefaults);
    validateParameters(providerDefaults);
    onParametersChange(providerDefaults);
    setStorageItem('ai-parameters', providerDefaults);
  };

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2', validationErrors.length > 0 && 'border-destructive text-destructive', className)}
        >
          <Sliders className="h-4 w-4" />
          <span className="hidden sm:inline">{t('parameters.title')}</span>
          {validationErrors.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold">{t('parameters.title')}</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetToDefaults}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('parameters.resetToDefault')}</TooltipContent>
            </Tooltip>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="text-xs text-destructive">
                  <p className="font-medium mb-1">{t('parameters.parametersOutOfRange')}</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-5">
            {/* Temperature */}
            <ParameterSlider
              label={t('parameters.creativity')}
              tooltip={t('parameters.creativityDesc')}
              value={clamp(parameters.temperature, currentLimits.temperature.min, currentLimits.temperature.max)}
              min={currentLimits.temperature.min}
              max={currentLimits.temperature.max}
              step={0.1}
              minLabel={t('parameters.conservative')}
              maxLabel={t('parameters.innovative')}
              onChange={(v) => updateParameter('temperature', v)}
              hasError={parameters.temperature < currentLimits.temperature.min || parameters.temperature > currentLimits.temperature.max}
            />

            {/* Max Tokens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t('parameters.outputLengthLimit')}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {parameters.maxTokens === undefined
                      ? t('parameters.noLengthLimit')
                      : t('parameters.maxTokens', { count: parameters.maxTokens })}
                  </span>
                  <Switch
                    checked={parameters.maxTokens === undefined}
                    onCheckedChange={(checked) => {
                      updateParameter('maxTokens', checked ? undefined : currentLimits.maxTokens.default);
                    }}
                  />
                </div>
              </div>
              {parameters.maxTokens !== undefined && (
                <>
                  <Slider
                    min={currentLimits.maxTokens.min}
                    max={currentLimits.maxTokens.max}
                    step={1}
                    value={[parameters.maxTokens || currentLimits.maxTokens.default]}
                    onValueChange={([v]) => updateParameter('maxTokens', v)}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{t('parameters.short')}</span>
                    <span>{t('parameters.long')}</span>
                  </div>
                </>
              )}
            </div>

            {/* Top-P */}
            <ParameterSlider
              label={t('parameters.diversity')}
              tooltip={t('parameters.diversityDesc')}
              value={clamp(parameters.topP, currentLimits.topP.min, currentLimits.topP.max)}
              min={currentLimits.topP.min}
              max={currentLimits.topP.max}
              step={0.1}
              minLabel={t('parameters.focused')}
              maxLabel={t('parameters.diverse')}
              onChange={(v) => updateParameter('topP', v)}
              hasError={parameters.topP < currentLimits.topP.min || parameters.topP > currentLimits.topP.max}
            />

            {/* Top-K (Gemini, Claude, Ollama) */}
            {currentLimits.topK && selectedModel?.provider !== 'openai' && selectedModel?.provider !== 'xai' && (
              <ParameterSlider
                label={t('parameters.topK')}
                value={parameters.topK || currentLimits.topK.default}
                min={currentLimits.topK.min}
                max={currentLimits.topK.max}
                step={1}
                minLabel={t('parameters.focused')}
                maxLabel={t('parameters.diverse')}
                onChange={(v) => updateParameter('topK', v)}
              />
            )}

            {/* Frequency Penalty (OpenAI, xAI) */}
            {currentLimits.frequencyPenalty && (
              <ParameterSlider
                label={t('parameters.frequencyPenalty')}
                value={parameters.frequencyPenalty || 0}
                min={currentLimits.frequencyPenalty.min}
                max={currentLimits.frequencyPenalty.max}
                step={0.1}
                minLabel={t('parameters.allowRepetition')}
                maxLabel={t('parameters.avoidRepetition')}
                onChange={(v) => updateParameter('frequencyPenalty', v)}
              />
            )}

            {/* Presence Penalty (OpenAI, xAI) */}
            {currentLimits.presencePenalty && (
              <ParameterSlider
                label={t('parameters.presencePenalty')}
                value={parameters.presencePenalty || 0}
                min={currentLimits.presencePenalty.min}
                max={currentLimits.presencePenalty.max}
                step={0.1}
                minLabel={t('parameters.deepenTopic')}
                maxLabel={t('parameters.exploreNew')}
                onChange={(v) => updateParameter('presencePenalty', v)}
              />
            )}

            {/* Repetition Penalty (Ollama) */}
            {currentLimits.repetitionPenalty && (
              <ParameterSlider
                label={t('parameters.repetitionPenalty')}
                value={parameters.repetitionPenalty || currentLimits.repetitionPenalty.default}
                min={currentLimits.repetitionPenalty.min}
                max={currentLimits.repetitionPenalty.max}
                step={0.05}
                minLabel={t('parameters.allowRepetition')}
                maxLabel={t('parameters.avoidRepetition')}
                onChange={(v) => updateParameter('repetitionPenalty', v)}
              />
            )}

            {/* OpenAI Responses API */}
            {selectedModel?.provider === 'openai' && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('parameters.responsesApi')}</p>
                    <p className="text-xs text-muted-foreground">
                      {parameters.useResponsesAPI ? t('parameters.statefulMode') : t('parameters.standardMode')}
                    </p>
                  </div>
                  <Switch
                    checked={parameters.useResponsesAPI ?? false}
                    onCheckedChange={(checked) => updateParameter('useResponsesAPI', checked)}
                  />
                </div>
              </>
            )}

            {/* Research model tools */}
            {isResearchModel(selectedModel?.model) && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">{t('parameters.researchTools')}</p>
                    <Badge variant="secondary" className="text-[10px]">{t('parameters.deepResearch')}</Badge>
                  </div>
                  <div className="space-y-3">
                    <ResearchToggle
                      label={t('parameters.webSearch')}
                      description={t('parameters.webSearchDesc')}
                      checked={parameters.researchTools?.webSearch ?? true}
                      onCheckedChange={(v) => updateResearchTool('webSearch', v)}
                    />
                    <ResearchToggle
                      label={t('parameters.codeInterpreter')}
                      description={t('parameters.codeInterpreterDesc')}
                      checked={parameters.researchTools?.codeInterpreter ?? true}
                      onCheckedChange={(v) => updateResearchTool('codeInterpreter', v)}
                    />
                    <ResearchToggle
                      label={t('parameters.fileSearch')}
                      description={t('parameters.fileSearchDesc')}
                      checked={parameters.researchTools?.fileSearch ?? true}
                      onCheckedChange={(v) => updateResearchTool('fileSearch', v)}
                    />
                    <Separator />
                    <ResearchToggle
                      label={t('parameters.backgroundMode')}
                      description={t('parameters.backgroundModeDesc')}
                      checked={parameters.background ?? true}
                      onCheckedChange={(v) => updateParameter('background', v)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 p-2 bg-muted rounded-md">
                    {t('parameters.researchTip')}
                  </p>
                </div>
              </>
            )}

            {/* Current config summary */}
            <Separator />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-2">
                {t('parameters.currentAdaptation', {
                  provider: selectedModel?.provider?.toUpperCase() || 'AI',
                  model: selectedModel?.model || 'Model'
                })}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted rounded p-1.5 text-center">
                  <div className="font-medium">{t('parameters.temperatureRange')}</div>
                  <div>{currentLimits.temperature.min}-{currentLimits.temperature.max}</div>
                </div>
                <div className="bg-muted rounded p-1.5 text-center">
                  <div className="font-medium">{t('parameters.maxToken')}</div>
                  <div>{(currentLimits.maxTokens.max / 1000).toFixed(0)}K</div>
                </div>
                <div className="bg-muted rounded p-1.5 text-center">
                  <div className="font-medium">{t('parameters.topPRange')}</div>
                  <div>{currentLimits.topP.min}-{currentLimits.topP.max}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* Reusable parameter slider row */
function ParameterSlider({
  label, tooltip, value, min, max, step, minLabel, maxLabel, onChange, hasError
}: {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
  onChange: (v: number) => void;
  hasError?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="text-sm font-medium cursor-help">{label}</label>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[200px]">{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <label className="text-sm font-medium">{label}</label>
        )}
        <span className={cn(
          'text-xs tabular-nums px-1.5 py-0.5 rounded',
          hasError ? 'text-destructive bg-destructive/10' : 'text-muted-foreground bg-muted'
        )}>
          {step >= 1 ? value : value.toFixed(step < 0.1 ? 2 : 1)}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>{minLabel} ({min})</span>
        <span>{maxLabel} ({max})</span>
      </div>
    </div>
  );
}

/* Research tool toggle row */
function ResearchToggle({
  label, description, checked, onCheckedChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
