import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { FormSkeleton } from '@/components/auth/form-skeleton';
import { ResendVerificationForm } from '@/components/auth/resend-verification-form';
import { FormError, FormNotice } from '@/components/forms/form-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { safeRedirectPath } from '@/shared/access';
import { getSession } from '@/shared/auth';

export const metadata: Metadata = { title: 'Подтверждение email — Tasker' };

export default function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Подтверждение email</CardTitle>
        <CardDescription>Ссылка из письма действует 24 часа</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton fields={1} />}>
          <VerifyEmailSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'TOKEN_EXPIRED':
      return 'Срок действия ссылки истёк. Отправим новую.';
    case 'USER_NOT_FOUND':
      return 'Аккаунт для этой ссылки не найден. Зарегистрируйтесь ещё раз.';
    default:
      return 'Ссылка недействительна. Отправим новую.';
  }
}

/**
 * Сюда ведут: регистрация (?sent=1) и ссылка из письма — Better Auth подтверждает email, сразу
 * выполняет вход и возвращает на эту страницу (или добавляет ?error=…). С сессией и без ошибки —
 * уходим на returnTo.
 */
async function VerifyEmailSection({
  searchParams,
}: Pick<PageProps<'/verify-email'>, 'searchParams'>) {
  const { returnTo, sent, error } = await searchParams;
  const target = safeRedirectPath(returnTo);
  const errorCode = typeof error === 'string' ? error : null;

  if (!errorCode && (await getSession())) redirect(target);

  return (
    <div className="grid gap-6">
      {errorCode ? (
        <FormError message={errorMessage(errorCode)} />
      ) : (
        <FormNotice
          message={
            sent === '1'
              ? 'Мы отправили письмо со ссылкой для подтверждения. Откройте его, чтобы войти в Tasker. Проверьте и папку «Спам».'
              : 'Откройте ссылку из письма, чтобы подтвердить email и войти.'
          }
        />
      )}
      <ResendVerificationForm returnTo={target} />
      <Link
        href={target === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(target)}`}
        className="text-center text-sm text-muted-foreground underline underline-offset-4"
      >
        Уже подтвердили? Войти
      </Link>
    </div>
  );
}
