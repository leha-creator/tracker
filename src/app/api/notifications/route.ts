import {
  countMyUnreadNotifications,
  listMyNotifications,
  NOTIFICATIONS_MENU_SIZE,
} from '@/modules/notifications';
import { getSession } from '@/shared/auth';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.notifications');
const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Последние уведомления и число непрочитанных — для выпадающего списка колокольчика. */
export async function GET(): Promise<Response> {
  try {
    const session = await getSession();
    if (!session) {
      log.warn('[api.notifications] no session');
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }
    const [page, unreadCount] = await Promise.all([
      listMyNotifications(session, { limit: NOTIFICATIONS_MENU_SIZE }),
      countMyUnreadNotifications(session),
    ]);
    log.debug(
      { userId: session.user.id, count: page.items.length, unreadCount },
      '[api.notifications] list',
    );
    return Response.json(
      { items: page.items, hasMore: page.nextCursor !== null, unreadCount },
      { headers: NO_STORE },
    );
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/notifications' });
  }
}
