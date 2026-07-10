import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOnmiCopy } from '@/components/onmi/useOnmiCopy';

export default function NotFoundPage() {
  const copy = useOnmiCopy();
  return (
    <main className="onmi min-h-screen grid place-items-center bg-[var(--bg-0)] px-6">
      <section className="max-w-md text-center">
        <SearchX className="mx-auto mb-4 h-10 w-10 text-[var(--fg-3)]" />
        <div className="onmi-section-label">HTTP · 404</div>
        <h1 className="mt-3 text-2xl font-semibold">{copy('页面不存在', 'Page not found')}</h1>
        <p className="mt-2 text-sm text-[var(--fg-2)]">
          {copy('这个地址没有对应的 ONMI 页面，或者页面已被移动。', 'This address does not map to an ONMI page, or the page has moved.')}
        </p>
        <Link to="/chat" className="onmi-btn primary mt-6 inline-flex">
          <ArrowLeft size={13} /> {copy('返回聊天', 'Back to chat')}
        </Link>
      </section>
    </main>
  );
}
