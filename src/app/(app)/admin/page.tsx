import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAdminOrNotFound } from '@/shared/access';

// Без собственного metadata.title: статический shell отдаётся до проверки роли,
// и заголовок раскрыл бы существование раздела не-администратору.

export default function AdminPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Suspense
        fallback={<div className="h-40 w-full max-w-md animate-pulse rounded-xl bg-muted" />}
      >
        <AdminContent />
      </Suspense>
    </main>
  );
}

/** Не-администратор получает 404: существование раздела не раскрываем. */
async function AdminContent() {
  const { user } = await requireAdminOrNotFound();
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Администрирование ресурса</CardTitle>
        <CardDescription>Вы вошли как {user.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Управление пользователями и пространствами появится на этапе «Администрирование ресурса».
        </p>
      </CardContent>
    </Card>
  );
}
