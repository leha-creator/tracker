import type { Metadata } from 'next';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { FormSkeleton } from '@/components/auth/form-skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Восстановление пароля — Tasker' };

export default function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Восстановление пароля</CardTitle>
        <CardDescription>Пришлём ссылку для нового пароля на ваш email</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton fields={1} />}>
          <ForgotPasswordSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function ForgotPasswordSection({
  searchParams,
}: Pick<PageProps<'/forgot-password'>, 'searchParams'>) {
  // Вошедший пользователь меняет пароль в профиле.
  await resolveAuthPageReturnTo(searchParams);
  return <ForgotPasswordForm />;
}
