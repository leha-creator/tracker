import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SectionHeading } from '@/components/layout/page-header';
import { NotificationSettings } from '@/components/profile/notification-settings';
import { Skeleton } from '@/components/ui/skeleton';
import { getMyNotificationPreferences } from '@/modules/notifications';
import { requireUserOrRedirect } from '@/shared/access';

export const metadata: Metadata = { title: 'Настройки уведомлений — Tasker' };

export default function ProfileNotificationsPage() {
  return (
    <section aria-labelledby="notification-settings-heading" className="grid gap-3">
      <div className="grid gap-1">
        <SectionHeading id="notification-settings-heading" title="Настройки уведомлений" />
        <p className="text-sm text-muted-foreground">
          Выберите, о чём сообщать в приложении (колокольчик в шапке) и письмом.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
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
