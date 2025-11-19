import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // 确保 content 是字符串
  const safeContent = typeof content === 'string' ? content : String(content || '');
  
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 自定义代码块样式
          code: ({ inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto my-4">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                {children}
              </code>
            );
          },
          // 自定义段落样式
          p: ({ children }: any) => (
            <p className="mb-3 leading-relaxed">{children}</p>
          ),
          // 自定义标题样式
          h1: ({ children }: any) => (
            <h1 className="text-2xl font-bold mb-4 mt-6 text-gray-900">{children}</h1>
          ),
          h2: ({ children }: any) => (
            <h2 className="text-xl font-bold mb-3 mt-5 text-gray-900">{children}</h2>
          ),
          h3: ({ children }: any) => (
            <h3 className="text-lg font-semibold mb-2 mt-4 text-gray-900">{children}</h3>
          ),
          // 自定义列表样式
          ul: ({ children }: any) => (
            <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }: any) => (
            <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }: any) => (
            <li className="text-gray-700">{children}</li>
          ),
          // 自定义链接样式
          a: ({ href, children }: any) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              {children}
            </a>
          ),
          // 自定义引用样式
          blockquote: ({ children }: any) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 py-2 my-4 bg-gray-50 italic">
              {children}
            </blockquote>
          ),
          // 自定义表格样式
          table: ({ children }: any) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-300">{children}</table>
            </div>
          ),
          thead: ({ children }: any) => (
            <thead className="bg-gray-100">{children}</thead>
          ),
          th: ({ children }: any) => (
            <th className="border border-gray-300 px-4 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }: any) => (
            <td className="border border-gray-300 px-4 py-2">{children}</td>
          ),
          // 自定义分割线样式
          hr: () => (
            <hr className="my-6 border-gray-300" />
          ),
        } as Components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}