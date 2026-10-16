import { Suspense } from 'react';

import { AdminNav } from '@/components/admin/admin-nav';
import { PageContainer } from '@/components/layout/page-container';
import { requireAdminOrNotFound } from '@/shared/access';

// Без собственного metadata.title и заголовка в статическом shell: он отдаётся до проверки роли
// и раскрыл бы существование раздела не-администратору.
// {children} — вне проверки: каждая страница раздела сама вызывает requireAdminOrNotFound(),
// а layout не блокирует рендер и валидацию сегмента страницы.

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="grid gap-6 py-6">
      <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-muted" />}>
        <AdminHeader />
      </Suspense>
      {children}
    </PageContainer>
  );
}

/** Заголовок и вкладки раздела — только администратору, остальным 404. */
async function AdminHeader() {
  await requireAdminOrNotFound('/admin');
  return (
    <div className="grid gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Администрирование</h1>
      <AdminNav />
    </div>
  );
}
