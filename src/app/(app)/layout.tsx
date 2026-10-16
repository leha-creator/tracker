import Link from 'next/link';
import { Suspense } from 'react';

import { UserMenu } from '@/components/auth/user-menu';
import { PageContainer } from '@/components/layout/page-container';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { WorkspaceSwitcher } from '@/components/workspaces/workspace-switcher';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Перейти к содержимому
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <PageContainer size="wide" className="flex flex-wrap items-center gap-x-1.5">
          <Link
            href="/"
            className="flex h-14 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogoMark />
            <span className="max-sm:sr-only">Tasker</span>
          </Link>
          <span aria-hidden className="text-muted-foreground/40">
            /
          </span>
          {/* Переключатель и разделы пространства — соседние элементы строки; разделы на мобильных уходят вниз. */}
          <Suspense fallback={<div className="h-7 w-32 animate-pulse rounded-md bg-muted" />}>
            <WorkspaceSwitcher />
          </Suspense>
          {/* Сессия читается внутри границы: шапка и {children} не ждут её на верхнем уровне. */}
          <div className="ml-auto flex h-14 items-center gap-1.5 pl-3">
            <Suspense fallback={<div className="size-8 animate-pulse rounded-lg bg-muted" />}>
              <NotificationBell />
            </Suspense>
            <Suspense fallback={<div className="size-8 animate-pulse rounded-lg bg-muted" />}>
              <UserMenu />
            </Suspense>
          </div>
        </PageContainer>
      </header>
      {children}
    </>
  );
}

/** Знак приложения: три колонки доски разной высоты. */
function LogoMark() {
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
        <rect x="2" y="3" width="3" height="10" rx="1" />
        <rect x="6.5" y="3" width="3" height="7" rx="1" />
        <rect x="11" y="3" width="3" height="4" rx="1" />
      </svg>
    </span>
  );
}
