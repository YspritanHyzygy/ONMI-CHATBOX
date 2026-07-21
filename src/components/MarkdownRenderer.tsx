import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github.css';
import type { Components } from 'react-markdown';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/** 提取代码块 children 里的纯文本用于复制 */
function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function CodeBlock({ language, codeClassName, children, ...props }: {
  language: string;
  codeClassName?: string;
  children: ReactNode;
}) {
  const t = useOnmiCopy();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractText(children).replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板权限被拒时静默失败；按钮状态不变即为反馈
    }
  };

  return (
    <div className="group relative my-4">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted/80 px-3 py-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={t('复制代码', 'Copy code')}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
        </button>
      </div>
      <pre className="bg-muted rounded-b-lg p-4 overflow-x-auto mt-0">
        <code className={codeClassName} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
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
              <CodeBlock language={match[1]} codeClassName={codeClassName} {...props}>
                {children}
              </CodeBlock>
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
