import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AuditEventList } from '@/components/audit/audit-event-list';
import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { ActiveSessions } from '@/components/profile/security/active-sessions';
import { ChangePasswordForm } from '@/components/profile/security/change-password-form';
import { TwoFactorSection } from '@/components/profile/security/two-factor-section';
import { listMySecurityEvents, parseAuditCursor } from '@/modules/audit';
import { getMyTwoFactorState, listMySessions } from '@/modules/auth';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Безопасность — Tasker' };

export default function ProfileSecurityPage({ searchParams }: PageProps<'/profile/security'>) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <SecuritySections searchParams={searchParams} />
    </Suspense>
  );
}

async function SecuritySections({
  searchParams,
}: {
  searchParams: PageProps<'/profile/security'>['searchParams'];
}) {
  const session = await requireUserOrRedirect('/profile/security');
  const { events: cursor } = await searchParams;
  const [twoFactor, sessions, events] = await Promise.all([
    getMyTwoFactorState(),
    listMySessions(),
    listMySecurityEvents(parseAuditCursor(cursor)),
  ]);

  return (
    <SettingsSections>
      <SettingsSection
        title="Пароль"
        description="После смены пароля другие устройства выйдут из аккаунта, а на почту придёт уведомление."
      >
        {twoFactor.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-muted-foreground">
            Вы входите через GitHub, пароля у аккаунта нет. Задать его можно через «Забыли пароль?»
            на странице входа.
          </p>
        )}
      </SettingsSection>
      <SettingsSection
        title="Двухфакторная аутентификация"
        description="Код из приложения-аутентификатора при входе по паролю. Вход через GitHub защищает сам GitHub."
      >
        <TwoFactorSection state={twoFactor} email={session.user.email} />
      </SettingsSection>
      <SettingsSection title="Активные сессии" description="Устройства, на которых выполнен вход.">
        <ActiveSessions sessions={sessions} />
      </SettingsSection>
      <SettingsSection
        title="Журнал безопасности"
        description="Входы, неудачные попытки, смена пароля, 2FA, сессии и токены. Незнакомое устройство или IP — повод сменить пароль."
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
