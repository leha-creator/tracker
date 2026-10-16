import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { resolveAuthPageReturnTo } from '@/components/auth/auth-redirect';
import { FormSkeleton } from '@/components/auth/form-skeleton';
import { TwoFactorSignInForm } from '@/components/auth/two-factor-sign-in-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hasPendingTwoFactorSignIn } from '@/modules/auth';

export const metadata: Metadata = { title: 'Код подтверждения — Tasker' };

export default function TwoFactorPage({ searchParams }: PageProps<'/login/two-factor'>) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Двухфакторная аутентификация</CardTitle>
        <CardDescription>Введите код из приложения-аутентификатора</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton fields={1} />}>
          <TwoFactorSection searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function TwoFactorSection({
  searchParams,
}: Pick<PageProps<'/login/two-factor'>, 'searchParams'>) {
  const returnTo = await resolveAuthPageReturnTo(searchParams);
  // Без незавершённого входа (cookie второго шага, 10 минут) здесь делать нечего.
  if (!(await hasPendingTwoFactorSignIn())) {
    redirect(returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return <TwoFactorSignInForm returnTo={returnTo} />;
}
