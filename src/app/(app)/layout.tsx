import Link from 'next/link';
import { Suspense } from 'react';

import { UserMenu } from '@/components/auth/user-menu';
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="font-semibold">
            Tasker
          </Link>
          <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-md bg-muted" />}>
            <WorkspaceSwitcher />
          </Suspense>
        </div>
        {/* Сессия читается внутри границы: шапка и {children} не ждут её на верхнем уровне. */}
        <Suspense fallback={<div className="h-9 w-48 animate-pulse rounded-md bg-muted" />}>
          <UserMenu />
        </Suspense>
      </header>
      {children}
    </>
  );
}
