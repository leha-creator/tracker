import { Suspense } from 'react';

import { AdminNav } from '@/components/admin/admin-nav';
import { requireAdminOrNotFound } from '@/shared/access';

// Без собственного metadata.title и заголовка в статическом shell: он отдаётся до проверки роли
// и раскрыл бы существование раздела не-администратору.
// {children} — вне проверки: каждая страница раздела сама вызывает requireAdminOrNotFound(),
// а layout не блокирует рендер и валидацию сегмента страницы.

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-6">
      <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-muted" />}>
        <AdminHeader />
      </Suspense>
      {children}
    </main>
  );
}

/** Заголовок и вкладки раздела — только администратору, остальным 404. */
async function AdminHeader() {
  await requireAdminOrNotFound('/admin');
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold">Администрирование</h1>
      <AdminNav />
    </div>
  );
}
