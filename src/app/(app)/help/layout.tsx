import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';

import { HELP_HREF } from '@/components/help/help-href';
import { HelpNav } from '@/components/help/help-nav';
import { PageContainer } from '@/components/layout/page-container';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Справка — Tasker' };

export default function HelpLayout({ children }: LayoutProps<'/help'>) {
  return (
    <PageContainer
      as="main"
      id="main-content"
      size="wide"
      className="grid gap-6 py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
    >
      <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        {/* usePathname: статьи пререндерятся по generateStaticParams. */}
        <Suspense fallback={<div aria-hidden className="h-10 rounded-lg border lg:hidden" />}>
          <HelpNav />
        </Suspense>
      </aside>
      <div className="min-w-0">
        <Suspense fallback={null}>
          <SignedInOnly>{children}</SignedInOnly>
        </Suspense>
      </div>
    </PageContainer>
  );
}

/**
 * proxy.ts проверяет только наличие cookie, поэтому сессию проверяем здесь. Статья
 * по-прежнему берётся из кеша, а ждёт только проверка входа.
 */
async function SignedInOnly({ children }: { children: ReactNode }) {
  await requireUserOrRedirect(HELP_HREF);
  return children;
}
