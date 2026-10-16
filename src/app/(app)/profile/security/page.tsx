import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SettingsSection, SettingsSections } from '@/components/layout/settings-section';
import { ActiveSessions } from '@/components/profile/security/active-sessions';
import { ChangePasswordForm } from '@/components/profile/security/change-password-form';
import { TwoFactorSection } from '@/components/profile/security/two-factor-section';
import { getMyTwoFactorState, listMySessions } from '@/modules/auth';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Безопасность — Tasker' };

export default function ProfileSecurityPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <SecuritySections />
    </Suspense>
  );
}

async function SecuritySections() {
  const session = await requireUserOrRedirect('/profile/security');
  const [twoFactor, sessions] = await Promise.all([getMyTwoFactorState(), listMySessions()]);

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
    </SettingsSections>
  );
}
