import React, { useState, useEffect, useRef } from 'react';
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
    const contentRef = useRef<HTMLDivElement>(null);

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

            <div
                ref={contentRef}
                className="transition-all duration-300 ease-in-out overflow-hidden"
                style={{
                    maxHeight: isExpanded ? `${contentRef.current?.scrollHeight || 1000}px` : '0px',
                    opacity: isExpanded ? 1 : 0
                }}
            >
                <ThinkingContent content={content || ''} />

                {signature && (
                    <div className="px-4 py-1 bg-gray-100 text-xs text-gray-400 border-t border-gray-200 font-mono truncate">
                        Signature: {signature}
                    </div>
                )}
            </div>
        </div>
    );
};
