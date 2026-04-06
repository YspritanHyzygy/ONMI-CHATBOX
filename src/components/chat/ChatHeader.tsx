import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ModelSelector from '@/components/ModelSelector';
import AIParametersPanel from '@/components/AIParametersPanel';
import ErrorBoundary from '@/components/ErrorBoundary';
import ResponseApiIndicator from '@/components/ResponseApiIndicator';
import type { Conversation, ModelOption, AIParameters } from '@/hooks/useChat';

interface ChatHeaderProps {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
  currentConversation: Conversation | null;
  selectedModel: ModelOption | null;
  aiParameters: AIParameters;
  isLoading: boolean;
  onModelChange: (model: ModelOption) => void;
  onParametersChange: (params: AIParameters) => void;
}

export default function ChatHeader({
  showSidebar,
  setShowSidebar,
  currentConversation,
  selectedModel,
  aiParameters,
  isLoading,
  onModelChange,
  onParametersChange,
}: ChatHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="h-8 w-8"
          >
            {showSidebar ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <div>
            <h2 className="text-sm font-medium text-foreground">
              {currentConversation ? currentConversation.title : t('chat.startNewChat')}
            </h2>
            {currentConversation?.provider && (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground">
                  {currentConversation.provider === 'openai' ? 'OpenAI' : currentConversation.provider} · {currentConversation.model}
                </p>
                {selectedModel?.provider === 'openai' && aiParameters.useResponsesAPI && (
                  <ResponseApiIndicator isActive={true} isProcessing={isLoading} />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ErrorBoundary
            fallback={
              <div className="text-xs text-destructive px-2 py-1 border border-destructive/20 rounded-md bg-destructive/10">
                {t('chat.modelSelectorError', { defaultValue: 'Model selector failed' })}
              </div>
            }
          >
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={onModelChange}
            />
          </ErrorBoundary>
          <AIParametersPanel
            onParametersChange={onParametersChange}
            selectedModel={selectedModel}
          />
        </div>
      </div>
    </div>
  );
}
