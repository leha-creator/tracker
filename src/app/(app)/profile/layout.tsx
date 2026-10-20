import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ProfileNav } from '@/components/profile/profile-nav';

export const metadata: Metadata = { title: 'Профиль — Tasker' };

export default function ProfileLayout({ children }: LayoutProps<'/profile'>) {
  return (
    <PageContainer as="main" id="main-content" size="narrow" className="grid gap-6 py-6">
      <div className="grid gap-3">
        <PageHeader title="Мой профиль" />
        {/* usePathname: журнал токена (/profile/tokens/[tokenId]) пререндерится без адреса. */}
        <Suspense fallback={<div aria-hidden className="h-10 border-b" />}>
          <ProfileNav />
        </Suspense>
      </div>
      {children}
    </PageContainer>
  );
}
