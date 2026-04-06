import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ThinkingHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  tokens?: number;
  effort?: string;
  className?: string;
}

export const ThinkingHeader: React.FC<ThinkingHeaderProps> = ({
  isExpanded,
  onToggle,
  isStreaming = false,
  tokens,
  effort,
  className = ''
}) => {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted transition-colors ${className}`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        <span className="font-medium text-foreground text-xs flex items-center gap-2">
          Thinking
          {isStreaming && (
            <span className="animate-pulse text-primary text-[10px]">●</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {effort && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {effort}
          </Badge>
        )}
        {tokens !== undefined && tokens > 0 && (
          <span className="text-[10px] text-muted-foreground">{tokens} tokens</span>
        )}
      </div>
    </div>
  );
};
