import { Zap, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

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

  if (!isActive) return null;

  return (
    <Badge
      variant="secondary"
      className={`gap-1 text-[10px] ${className}`}
      title={t('chat.responsesApiTooltip')}
    >
      {isProcessing ? (
        <>
          <Radio className="h-3 w-3 animate-pulse" />
          {t('chat.responsesApiProcessing')}
        </>
      ) : (
        <>
          <Zap className="h-3 w-3" />
          {t('chat.responsesApiActive')}
        </>
      )}
    </Badge>
  );
}
