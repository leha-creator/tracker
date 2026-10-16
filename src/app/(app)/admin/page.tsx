import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { requireAdminOrNotFound } from '@/shared/access';

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminRedirect />
    </Suspense>
  );
}

/** Раздел по умолчанию — пользователи. Не-администратору — 404, а не редирект. */
async function AdminRedirect(): Promise<null> {
  await requireAdminOrNotFound('/admin');
  redirect('/admin/users');
}
