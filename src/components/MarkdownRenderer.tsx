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
  const safeContent = typeof content === 'string' ? content : String(content || '');

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: ({ inline, className: codeClassName, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            return !inline && match ? (
              <pre className="bg-muted rounded-lg p-4 overflow-x-auto my-4">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          p: ({ children }: any) => (
            <p className="mb-3 leading-relaxed">{children}</p>
          ),
          h1: ({ children }: any) => (
            <h1 className="text-2xl font-bold mb-4 mt-6 text-foreground">{children}</h1>
          ),
          h2: ({ children }: any) => (
            <h2 className="text-xl font-bold mb-3 mt-5 text-foreground">{children}</h2>
          ),
          h3: ({ children }: any) => (
            <h3 className="text-lg font-semibold mb-2 mt-4 text-foreground">{children}</h3>
          ),
          ul: ({ children }: any) => (
            <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
          ),
          ol: ({ children }: any) => (
            <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
          ),
          li: ({ children }: any) => (
            <li className="text-foreground/80">{children}</li>
          ),
          a: ({ href, children }: any) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 underline underline-offset-4"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }: any) => (
            <blockquote className="border-l-4 border-border pl-4 py-2 my-4 bg-muted/50 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }: any) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-border">{children}</table>
            </div>
          ),
          thead: ({ children }: any) => (
            <thead className="bg-muted">{children}</thead>
          ),
          th: ({ children }: any) => (
            <th className="border border-border px-4 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }: any) => (
            <td className="border border-border px-4 py-2">{children}</td>
          ),
          hr: () => (
            <hr className="my-6 border-border" />
          ),
        } as Components}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}
