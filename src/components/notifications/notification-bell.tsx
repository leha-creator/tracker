import { countMyUnreadNotifications } from '@/modules/notifications';
import { requireUserOrRedirect } from '@/shared/access';

import { NotificationBellMenu } from './notification-bell-menu';

/** Колокольчик в шапке. Читает сессию — рендерить внутри <Suspense>. */
export async function NotificationBell() {
  const session = await requireUserOrRedirect();
  const unread = await countMyUnreadNotifications(session);
  return <NotificationBellMenu initialUnreadCount={unread} />;
}
