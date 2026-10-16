import type { Metadata } from 'next';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { FormSkeleton } from '@/components/auth/form-skeleton';
import { GithubSignIn } from '@/components/auth/github-sign-in';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Вход — Tasker' };

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Вход в Tasker</CardTitle>
        <CardDescription>Введите email и пароль</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Сессия и searchParams — данные запроса: читаем их за границей Suspense. */}
        <Suspense fallback={<FormSkeleton fields={2} />}>
          <SignInSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SignInSection({ searchParams }: Pick<PageProps<'/login'>, 'searchParams'>) {
  const returnTo = await resolveAuthPageReturnTo(searchParams);
  const { error, reset } = await searchParams;
  return (
    <div className="grid gap-6">
      <SignInForm
        returnTo={returnTo}
        notice={reset === '1' ? 'Пароль изменён. Войдите с новым паролем.' : undefined}
      />
      <GithubSignIn returnTo={returnTo} errorCode={typeof error === 'string' ? error : undefined} />
    </div>
  );
}
