import { useTranslation } from 'react-i18next';

interface LoadingIndicatorProps {
  message?: string;
  useResponsesAPI?: boolean;
  isStreaming?: boolean;
  className?: string;
}

export default function LoadingIndicator({
  message,
  useResponsesAPI = false,
  isStreaming = true,
  className = ''
}: LoadingIndicatorProps) {
  const { t } = useTranslation();

  const getLoadingMessage = () => {
    if (message) return message;
    if (useResponsesAPI) return t('chat.responsesApiProcessing');
    if (isStreaming) return t('chat.streamingActive');
    return t('chat.thinking');
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" />
      </div>
      <span className="text-xs text-muted-foreground">
        {getLoadingMessage()}
      </span>
    </div>
  );
}
