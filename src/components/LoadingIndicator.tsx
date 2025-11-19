import { Loader2 } from 'lucide-react';
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

  const getIndicatorColor = () => {
    if (useResponsesAPI) return 'text-purple-600';
    if (isStreaming) return 'text-blue-600';
    return 'text-gray-600';
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Loader2 className={`w-4 h-4 animate-spin ${getIndicatorColor()}`} />
      <span className={`text-sm ${getIndicatorColor()}`}>
        {getLoadingMessage()}
      </span>
    </div>
  );
}
