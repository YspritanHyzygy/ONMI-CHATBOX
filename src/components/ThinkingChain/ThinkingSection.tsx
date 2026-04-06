import React, { useState, useEffect } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ThinkingHeader } from './ThinkingHeader';
import { ThinkingContent } from './ThinkingContent';

interface ThinkingSectionProps {
  content?: string;
  tokens?: number;
  effort?: string;
  signature?: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

export const ThinkingSection: React.FC<ThinkingSectionProps> = ({
  content,
  tokens,
  effort,
  signature,
  isStreaming = false,
  defaultExpanded = false,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (isStreaming && content) {
      setIsExpanded(true);
    }
  }, [isStreaming, !!content]);

  if (!content && !isStreaming) {
    return null;
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className={`border border-border rounded-lg overflow-hidden my-2 ${className}`}>
      <CollapsibleTrigger asChild>
        <div>
          <ThinkingHeader
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
            isStreaming={isStreaming}
            tokens={tokens}
            effort={effort}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <ThinkingContent content={content || ''} />
        {signature && (
          <div className="px-4 py-1 bg-muted text-[10px] text-muted-foreground border-t border-border font-mono truncate">
            Signature: {signature}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
