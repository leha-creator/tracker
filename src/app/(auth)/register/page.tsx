import type { Metadata } from 'next';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { FormSkeleton } from '@/components/auth/form-skeleton';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Регистрация — Tasker' };

export default function RegisterPage({ searchParams }: PageProps<'/register'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>Создайте аккаунт, чтобы начать работу</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton fields={4} />}>
          <SignUpSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SignUpSection({ searchParams }: Pick<PageProps<'/register'>, 'searchParams'>) {
  const returnTo = await resolveAuthPageReturnTo(searchParams);
  return <SignUpForm returnTo={returnTo} />;
}
