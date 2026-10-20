import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InvitationResponse } from '@/components/workspaces/invitation-response';
import { WORKSPACE_ROLE_LABELS } from '@/components/workspaces/role-label';
import { signOutAction } from '@/modules/auth';
import { getInvitationForRecipient, type RecipientInvitationDto } from '@/modules/workspaces';
import { requireUserOrRedirect } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Приглашение — Tasker' };

type Props = PageProps<'/invite/[invitationId]'>;

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' });

export default function InvitationPage({ params }: Props) {
  return (
    <main id="main-content" className="flex flex-1 justify-center px-4 py-6 sm:px-6">
      <Card className="w-full max-w-md self-start">
        <Suspense fallback={<Skeleton className="m-6 h-32" />}>
          <InvitationSection params={params} />
        </Suspense>
      </Card>
    </main>
  );
}

async function loadInvitation(invitationId: string): Promise<RecipientInvitationDto> {
  const session = await requireUserOrRedirect(`/invite/${invitationId}`);
  try {
    return await getInvitationForRecipient(session, invitationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

async function InvitationSection({ params }: Pick<Props, 'params'>) {
  const { invitationId } = await params;
  const invitation = await loadInvitation(invitationId);

  switch (invitation.state) {
    case 'actionable':
      return (
        <>
          <CardHeader>
            <CardTitle>Приглашение в «{invitation.workspaceName}»</CardTitle>
            <CardDescription>
              {invitation.inviterName} приглашает вас в пространство. Роль:{' '}
              {WORKSPACE_ROLE_LABELS[invitation.role].toLowerCase()}. Приглашение действует до{' '}
              {dateFormat.format(invitation.expiresAt)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationResponse invitationId={invitation.id} />
          </CardContent>
        </>
      );
    case 'wrong-recipient':
      return (
        <>
          <CardHeader>
            <CardTitle>Приглашение для другого аккаунта</CardTitle>
            <CardDescription>
              Приглашение отправлено на {invitation.maskedEmail}. Войдите под этим email, чтобы
              принять его.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Выйти и войти под другим email
              </Button>
            </form>
          </CardContent>
        </>
      );
    case 'expired':
    case 'processed':
      return (
        <>
          <CardHeader>
            <CardTitle>
              {invitation.state === 'expired'
                ? 'Срок действия приглашения истёк'
                : 'Приглашение уже недействительно'}
            </CardTitle>
            <CardDescription>
              Попросите владельца пространства «{invitation.workspaceName}» отправить новое
              приглашение.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">На главную</Link>
            </Button>
          </CardContent>
        </>
      );
  }
}
