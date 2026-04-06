import { Sparkles, Code, Globe, Lightbulb, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';

interface ChatEmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

export default function ChatEmptyState({ onSuggestionClick }: ChatEmptyStateProps) {
  const { t } = useTranslation();

  const suggestions = [
    { icon: PenLine, text: t('chat.suggestion1', { defaultValue: 'Write a short story about a robot learning to paint' }) },
    { icon: Code, text: t('chat.suggestion2', { defaultValue: 'Explain how async/await works in JavaScript' }) },
    { icon: Globe, text: t('chat.suggestion3', { defaultValue: 'Compare the pros and cons of React vs Vue' }) },
    { icon: Lightbulb, text: t('chat.suggestion4', { defaultValue: 'Give me 5 creative project ideas for a weekend' }) },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-lg px-4">
        <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-primary-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {t('chat.startNewChat')}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t('chat.startChatDescription')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestions.map((suggestion, i) => {
            const Icon = suggestion.icon;
            return (
              <Card
                key={i}
                className="cursor-pointer hover:bg-accent/50 transition-colors text-left"
                onClick={() => onSuggestionClick?.(suggestion.text)}
              >
                <CardContent className="p-3 flex items-start gap-2.5">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground line-clamp-2">{suggestion.text}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
