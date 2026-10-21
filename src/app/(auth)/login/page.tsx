import type { Metadata } from 'next';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { IdpSignIn } from '@/components/auth/idp-sign-in';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Вход — Tasker' };

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Вход в Tasker</CardTitle>
        <CardDescription>
          Единая учётная запись plwedding ID: регистрация, пароль и двухфакторная защита — там.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Сессия и searchParams — данные запроса: читаем их за границей Suspense. */}
        <Suspense fallback={<Skeleton className="h-9" aria-busy="true" />}>
          <SignInSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SignInSection({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const returnTo = await resolveAuthPageReturnTo(searchParams);
  const { error } = await searchParams;
  return (
    <IdpSignIn returnTo={returnTo} errorCode={typeof error === 'string' ? error : undefined} />
  );
}
