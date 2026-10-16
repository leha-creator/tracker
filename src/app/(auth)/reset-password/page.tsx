import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { FormSkeleton } from '@/components/auth/form-skeleton';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FormError } from '@/components/forms/form-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Новый пароль — Tasker' };

export default function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Новый пароль</CardTitle>
        <CardDescription>Придумайте новый пароль для входа в Tasker</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton fields={2} />}>
          <ResetPasswordSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

/**
 * Better Auth проверяет ссылку из письма (/api/auth/reset-password/<token>) и ведёт сюда
 * с ?token=… или с ?error=INVALID_TOKEN.
 */
async function ResetPasswordSection({
  searchParams,
}: Pick<PageProps<'/reset-password'>, 'searchParams'>) {
  const { token, error } = await searchParams;
  if (typeof token !== 'string' || !token || error) {
    return (
      <div className="grid gap-4">
        <FormError message="Ссылка недействительна или устарела. Запросите новую — она действует 1 час." />
        <Link href="/forgot-password" className="text-center text-sm underline underline-offset-4">
          Запросить новую ссылку
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
