import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NotificationSettings } from '@/components/profile/notification-settings';
import { getMyNotificationPreferences } from '@/modules/notifications';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Настройки уведомлений — Tasker' };

export default function ProfileNotificationsPage() {
  return (
    <section aria-labelledby="notification-settings-heading" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="notification-settings-heading" className="text-lg font-semibold">
          Настройки уведомлений
        </h2>
        <p className="text-sm text-muted-foreground">
          Выберите, о чём сообщать в приложении (колокольчик в шапке) и письмом.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <SettingsSection />
      </Suspense>
    </section>
  );
}

async function SettingsSection() {
  const session = await requireUserOrRedirect('/profile/notifications');
  const items = await getMyNotificationPreferences(session);
  return <NotificationSettings items={items} />;
}
