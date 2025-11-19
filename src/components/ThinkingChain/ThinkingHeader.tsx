import React from 'react';

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
            className={`flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors ${className}`}
            onClick={onToggle}
        >
            <div className="flex items-center gap-2">
                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
                <span className="font-medium text-gray-700 text-sm flex items-center gap-2">
                    Thinking Process
                    {isStreaming && (
                        <span className="animate-pulse text-blue-500">●</span>
                    )}
                </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500">
                {effort && (
                    <span className="px-2 py-0.5 bg-gray-200 rounded-full text-gray-600">
                        {effort}
                    </span>
                )}
                {tokens !== undefined && tokens > 0 && (
                    <span>{tokens} tokens</span>
                )}
            </div>
        </div>
    );
};
