import { Zap, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResponseApiIndicatorProps {
  isActive: boolean;
  isProcessing?: boolean;
  className?: string;
}

export default function ResponseApiIndicator({ 
  isActive, 
  isProcessing = false,
  className = '' 
}: ResponseApiIndicatorProps) {
  const { t } = useTranslation();

  if (!isActive) {
    return null;
  }

  return (
    <div 
      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        isProcessing 
          ? 'bg-blue-100 text-blue-700 border border-blue-300' 
          : 'bg-purple-100 text-purple-700 border border-purple-300'
      } ${className}`}
      title={t('chat.responsesApiTooltip')}
    >
      {isProcessing ? (
        <>
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>{t('chat.responsesApiProcessing')}</span>
        </>
      ) : (
        <>
          <Zap className="w-3.5 h-3.5" />
          <span>{t('chat.responsesApiActive')}</span>
        </>
      )}
    </div>
  );
}
