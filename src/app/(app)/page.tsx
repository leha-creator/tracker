import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdmin, requireUserOrRedirect } from '@/shared/access';

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tasker</CardTitle>
          <CardDescription>Простой таск-трекер для команд</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
            <Greeting />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function Greeting() {
  const { user } = await requireUserOrRedirect('/');
  return (
    <p className="text-sm text-muted-foreground">
      Здравствуйте, <span className="font-medium text-foreground">{user.name}</span>! Ваша роль:{' '}
      {isAdmin(user) ? 'администратор' : 'пользователь'}. Рабочие пространства, проекты и задачи
      появятся на следующих этапах.
    </p>
  );
}
