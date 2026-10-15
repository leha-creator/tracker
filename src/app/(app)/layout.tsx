import Link from 'next/link';
import { Suspense } from 'react';

import { UserMenu } from '@/components/auth/user-menu';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="font-semibold">
          Tasker
        </Link>
        {/* Сессия читается внутри границы: шапка и {children} не ждут её на верхнем уровне. */}
        <Suspense fallback={<div className="h-9 w-48 animate-pulse rounded-md bg-muted" />}>
          <UserMenu />
        </Suspense>
      </header>
      {children}
    </>
  );
}
