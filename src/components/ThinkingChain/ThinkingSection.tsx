import React, { useState, useEffect } from 'react';
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

    // Auto-expand when streaming starts if content exists
    useEffect(() => {
        if (isStreaming && content) {
            setIsExpanded(true);
        }
    }, [isStreaming, !!content]);

    if (!content && !isStreaming) {
        return null;
    }

    return (
        <div className={`border border-gray-200 rounded-lg overflow-hidden my-2 ${className}`}>
            <ThinkingHeader
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                isStreaming={isStreaming}
                tokens={tokens}
                effort={effort}
            />

            {isExpanded && (
                <ThinkingContent content={content || ''} />
            )}

            {signature && isExpanded && (
                <div className="px-4 py-1 bg-gray-100 text-xs text-gray-400 border-t border-gray-200 font-mono truncate">
                    Signature: {signature}
                </div>
            )}
        </div>
    );
};
