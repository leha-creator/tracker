'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from 'react';

import type { AdminUserListQuery } from '@/modules/admin/client';

import { adminUsersHref } from './admin-users-href';

interface AdminUsersContextValue {
  /** Запрос с учётом ещё не завершённой навигации — чтобы выбор отмечался сразу. */
  query: AdminUserListQuery;
  /** Переход к новому запросу; `replace` — без новой записи в истории (ввод в поиск). */
  navigate: (next: AdminUserListQuery, options?: { replace?: boolean }) => void;
}

const AdminUsersContext = createContext<AdminUsersContextValue | null>(null);

export function useAdminUsers(): AdminUsersContextValue {
  const context = useContext(AdminUsersContext);
  if (!context) throw new Error('useAdminUsers must be used inside <AdminUsersShell>');
  return context;
}

/**
 * Состояние списка живёт в URL, страница перерисовывается на сервере. Пока идёт переход,
 * корень помечен `data-pending` — таблица приглушается (`group-data-pending/users:`).
 */
export function AdminUsersShell({
  query,
  children,
}: {
  query: AdminUserListQuery;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticQuery, setOptimisticQuery] = useOptimistic(query);

  function navigate(next: AdminUserListQuery, options?: { replace?: boolean }) {
    const href = adminUsersHref(next);
    startTransition(() => {
      setOptimisticQuery(next);
      if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  return (
    <AdminUsersContext value={{ query: optimisticQuery, navigate }}>
      <div
        className="group/users grid gap-3"
        data-pending={isPending ? '' : undefined}
        aria-busy={isPending || undefined}
      >
        {children}
      </div>
    </AdminUsersContext>
  );
}
