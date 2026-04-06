import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getUserId } from '../lib/user';
import { getValidatedModel, setStorageItem } from '../lib/storage';
import { fetchWithAuth } from '../lib/fetch';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from '@/components/ui/command';

interface ModelOption {
  provider: string;
  providerName: string;
  model: string;
  displayName: string;
}

interface ModelSelectorProps {
  selectedModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  className?: string;
}

interface GroupedModels {
  [providerName: string]: ModelOption[];
}

const getProviderDisplayName = (providerId: string, providerName?: string): string => {
  if (providerName) return providerName;
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};

export default function ModelSelector({ selectedModel, onModelChange, className = '' }: ModelSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [groupedModels, setGroupedModels] = useState<GroupedModels>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);
  const isFetchingModels = useRef(false);

  const fetchModels = useCallback(async () => {
    if (isFetchingModels.current) return;
    isFetchingModels.current = true;
    setLoading(true);
    setError(null);

    try {
      const userId = getUserId();
      const response = await fetchWithAuth(`/api/providers?userId=${encodeURIComponent(userId)}`);
      if (!response.ok) {
        throw new Error(t('modelSelector.fetchError'));
      }
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        const models: ModelOption[] = [];
        const grouped: GroupedModels = {};
        let defaultModelFromSettings: ModelOption | null = null;
        const addedModels = new Set<string>();

        result.data.forEach((provider: any) => {
          if (provider && Array.isArray(provider.models)) {
            const providerId = provider.id || provider.provider_name;
            const providerDisplayName = getProviderDisplayName(providerId, provider.name || provider.displayName);
            const providerConfig = provider.config || {};
            const defaultModel = providerConfig.model;

            provider.models.forEach((model: string | { id?: string; name?: string; visibleInChat?: boolean; type?: string; [key: string]: unknown }) => {
              let modelId: string;
              let modelDisplayName: string;

              if (typeof model === 'string') {
                modelId = model;
                modelDisplayName = model;
              } else if (model && typeof model === 'object') {
                modelId = model.id || model.name || String(model);
                modelDisplayName = model.name || model.id || String(model);
                if (model.visibleInChat === false) return;
              } else {
                return;
              }

              const uniqueKey = `${providerId}-${modelId}`;
              if (addedModels.has(uniqueKey)) return;

              const modelOption: ModelOption = {
                provider: providerId,
                providerName: providerDisplayName,
                model: modelId,
                displayName: modelDisplayName,
              };

              models.push(modelOption);
              addedModels.add(uniqueKey);

              if (!grouped[providerDisplayName]) {
                grouped[providerDisplayName] = [];
              }
              grouped[providerDisplayName].push(modelOption);

              if (modelId === defaultModel && !defaultModelFromSettings) {
                defaultModelFromSettings = modelOption;
              }
            });
          }
        });

        // Sort default model to top within each group
        for (const [, groupModels] of Object.entries(grouped)) {
          const providerData = result.data.find((p: any) => {
            const pDisplayName = getProviderDisplayName(p.id || p.provider_name, p.name || p.displayName);
            return pDisplayName === groupModels[0]?.providerName;
          });
          const defaultModelId = providerData?.config?.model;
          if (defaultModelId) {
            const idx = groupModels.findIndex(m => m.model === defaultModelId);
            if (idx > 0) {
              const [dm] = groupModels.splice(idx, 1);
              groupModels.unshift(dm);
            }
          }
        }

        setAvailableModels(models);
        setGroupedModels(grouped);

        // Model selection priority: localStorage > settings default > first available
        let modelToSelect: ModelOption | null = null;

        const savedModelResult = getValidatedModel('selectedModel');
        if (savedModelResult.success && savedModelResult.data) {
          const matchedModel = models.find(m =>
            m.model === savedModelResult.data.model &&
            m.provider === savedModelResult.data.provider
          );
          if (matchedModel) modelToSelect = matchedModel;
        }

        if (!modelToSelect && defaultModelFromSettings) {
          modelToSelect = defaultModelFromSettings;
        }

        if (!modelToSelect && models.length > 0) {
          modelToSelect = models[0];
        }

        if (modelToSelect && isInitialMount.current) {
          if (!selectedModel ||
              selectedModel.model !== modelToSelect.model ||
              selectedModel.provider !== modelToSelect.provider) {
            const toSelect = modelToSelect;
            queueMicrotask(() => { onModelChange(toSelect); });
          }
          isInitialMount.current = false;
        }
      } else {
        setAvailableModels([]);
        setGroupedModels({});
        setError(t('modelSelector.configureFirst'));
      }
    } catch (e: any) {
      setError(e.message || t('modelSelector.loadFailed'));
    } finally {
      setLoading(false);
      isFetchingModels.current = false;
    }
  }, [onModelChange, selectedModel, t]);

  useEffect(() => {
    fetchModels();
    const handleModelsUpdated = () => fetchModels();
    window.addEventListener('modelsUpdated', handleModelsUpdated);
    return () => window.removeEventListener('modelsUpdated', handleModelsUpdated);
  }, []);

  // Close the popover when the viewport crosses the md breakpoint —
  // otherwise the floating panel keeps its old anchor coordinates after
  // a resize and ends up stuck on top of the sidebar.
  useEffect(() => {
    if (!open) return;
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = () => setOpen(false);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [open]);

  // Sync model selection from localStorage changes (cross-tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      let changedKey: string | null = null;
      if (e instanceof StorageEvent) {
        changedKey = e.key;
      } else if ('detail' in e && e.detail) {
        changedKey = (e.detail as { key: string }).key;
      }
      if (changedKey !== 'selectedModel') return;

      const savedModelResult = getValidatedModel('selectedModel');
      if (savedModelResult.success && savedModelResult.data && availableModels.length > 0) {
        const matchedModel = availableModels.find(m =>
          m.model === savedModelResult.data.model &&
          m.provider === savedModelResult.data.provider
        );
        if (matchedModel && (!selectedModel ||
            selectedModel.model !== matchedModel.model ||
            selectedModel.provider !== matchedModel.provider)) {
          queueMicrotask(() => { onModelChange(matchedModel); });
        }
      }
    };

    if (availableModels.length > 0) {
      window.addEventListener('storage', handleStorageChange as EventListener);
      window.addEventListener('localStorageChanged', handleStorageChange as EventListener);
      return () => {
        window.removeEventListener('storage', handleStorageChange as EventListener);
        window.removeEventListener('localStorageChanged', handleStorageChange as EventListener);
      };
    }
  }, [availableModels, selectedModel, onModelChange]);

  const handleModelSelect = (model: ModelOption) => {
    const saveResult = setStorageItem('selectedModel', model);
    if (!saveResult.success) {
      setError(saveResult.error || t('modelSelector.saveFailed'));
      return;
    }
    onModelChange(model);
    setOpen(false);
    setError(null);
  };

  if (loading) {
    return <div className={cn('text-sm text-muted-foreground', className)}>{t('modelSelector.loading')}</div>;
  }

  if (error || Object.keys(groupedModels).length === 0) {
    return (
      <div className={cn('text-sm text-destructive', className)}>
        {error || t('modelSelector.configureFirst')}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between min-w-[180px]', className)}
        >
          <span className="truncate text-left">
            {selectedModel ? (
              <span className="flex flex-col leading-tight">
                <span className="text-[10px] text-muted-foreground">{selectedModel.providerName}</span>
                <span className="text-sm">{selectedModel.displayName}</span>
              </span>
            ) : (
              t('modelSelector.selectModel')
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('modelSelector.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('modelSelector.noResults')}</CommandEmpty>
            {Object.entries(groupedModels).map(([providerName, models]) => (
              <CommandGroup key={providerName} heading={providerName}>
                {models.map((model) => (
                  <CommandItem
                    key={`${model.provider}-${model.model}`}
                    value={`${model.providerName} ${model.displayName}`}
                    onSelect={() => handleModelSelect(model)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedModel?.model === model.model && selectedModel?.provider === model.provider
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{model.displayName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
