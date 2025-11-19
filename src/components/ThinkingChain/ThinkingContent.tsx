import React from 'react';
import MarkdownRenderer from '../MarkdownRenderer';

interface ThinkingContentProps {
    content: string;
    className?: string;
}

export const ThinkingContent: React.FC<ThinkingContentProps> = ({
    content,
    className = ''
}) => {
    return (
        <div className={`p-4 bg-gray-50 text-gray-600 text-sm border-b border-gray-200 overflow-x-auto ${className}`}>
            <MarkdownRenderer content={content} className="prose-sm max-w-none" />
        </div>
    );
};
