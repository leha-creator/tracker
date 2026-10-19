import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { FormSkeleton } from '@/components/auth/form-skeleton';
import { GithubSignIn } from '@/components/auth/github-sign-in';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { getSignupPolicy } from '@/modules/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEnv } from '@/shared/env';
import { SIGNUP_REJECTION_MESSAGES } from '@/shared/resource-settings/client';

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
  const [returnTo, { signupMode }] = await Promise.all([
    resolveAuthPageReturnTo(searchParams),
    getSignupPolicy(),
  ]);
  if (signupMode === 'closed') {
    return (
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">{SIGNUP_REJECTION_MESSAGES.closed}</p>
        <Link href="/login" className="underline underline-offset-4">
          Войти в существующий аккаунт
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      {signupMode === 'invite_only' && (
        <p className="text-sm text-muted-foreground">
          Регистрация только по приглашению: укажите email, на который пришло приглашение.
        </p>
      )}
      <SignUpForm
        returnTo={returnTo}
        emailVerification={getEnv().AUTH_REQUIRE_EMAIL_VERIFICATION}
      />
      <GithubSignIn returnTo={returnTo} label="Зарегистрироваться через GitHub" />
    </div>
  );
}
