import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { Suspense } from 'react';

import { AuditEventList } from '@/components/audit/audit-event-list';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { ActiveSessions } from '@/components/profile/security/active-sessions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listMySecurityEvents, parseFeedCursor } from '@/modules/audit';
import { getIdpAccountUrl, listMySessions } from '@/modules/auth';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Безопасность — Tasker' };

export default function ProfileSecurityPage({ searchParams }: PageProps<'/profile/security'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SecuritySections searchParams={searchParams} />
    </Suspense>
  );
}

async function SecuritySections({
  searchParams,
}: {
  searchParams: PageProps<'/profile/security'>['searchParams'];
}) {
  await requireUserOrRedirect('/profile/security');
  const { events: cursor } = await searchParams;
  const [sessions, events] = await Promise.all([
    listMySessions(),
    listMySecurityEvents(parseFeedCursor(cursor)),
  ]);

  return (
    <SettingsSections>
      <SettingsSection
        title="Пароль и двухфакторная защита"
        description="Вход в Tasker — через единую учётную запись plwedding ID. Пароль, 2FA и её сеансы меняются там."
      >
        <div>
          <Button asChild variant="outline">
            <a href={getIdpAccountUrl()} target="_blank" rel="noreferrer">
              Пароль, 2FA и сессии в plwedding ID
              <ExternalLink />
            </a>
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Сеансы в Tasker"
        description="Устройства, на которых открыт Tasker. Выход здесь не завершает сеанс plwedding ID."
      >
        <ActiveSessions sessions={sessions} />
      </SettingsSection>
      <SettingsSection
        title="Журнал безопасности"
        description="Входы в Tasker, сессии и токены. Незнакомое устройство или IP — повод сменить пароль в plwedding ID."
      >
        <AuditEventList
          page={events}
          nextHref={(next) => `/profile/security?events=${encodeURIComponent(next)}`}
          showWorkspace
          emptyText="Событий пока нет."
        />
      </SettingsSection>
    </SettingsSections>
  );
}
