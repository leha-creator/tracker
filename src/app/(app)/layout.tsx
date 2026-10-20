import Link from 'next/link';
import { Suspense } from 'react';

import { UserMenu } from '@/components/auth/user-menu';
import { Logo } from '@/components/brand/logo';
import { AppHotkeys } from '@/components/hotkeys/app-hotkeys';
import { ShortcutsDialog } from '@/components/hotkeys/shortcuts-dialog';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';
import { PageContainer } from '@/components/layout/page-container';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { SearchTrigger } from '@/components/search/search-trigger';
import { Skeleton } from '@/components/ui/skeleton';
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
      {/* Сессия читается внутри границы: остальная страница не ждёт проверки имперсонации. */}
      <Suspense fallback={null}>
        <ImpersonationBanner />
      </Suspense>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <PageContainer size="wide" className="flex flex-wrap items-center gap-x-1.5">
          <Link
            href="/"
            className="flex h-14 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Logo hideWordmarkOnMobile />
          </Link>
          <span aria-hidden className="text-muted-foreground/40">
            /
          </span>
          {/* Переключатель и разделы пространства — соседние элементы строки; разделы на мобильных уходят вниз. */}
          <Suspense fallback={<Skeleton className="h-7 w-32" />}>
            <WorkspaceSwitcher />
          </Suspense>
          {/* Сессия читается внутри границы: шапка и {children} не ждут её на верхнем уровне. */}
          <div className="ml-auto flex h-14 items-center gap-1.5 pl-3">
            {/* useSearchParams внутри палитры — тоже под границей Suspense. */}
            <Suspense fallback={<div className="h-8 rounded-lg bg-muted max-md:size-8 md:w-52" />}>
              <SearchTrigger />
            </Suspense>
            <Suspense fallback={<Skeleton className="size-8 rounded-lg" />}>
              <NotificationBell />
            </Suspense>
            <Suspense fallback={<Skeleton className="size-8 rounded-lg" />}>
              <UserMenu />
            </Suspense>
          </div>
        </PageContainer>
      </header>
      <ShortcutsDialog />
      <AppHotkeys />
      {children}
    </>
  );
}
