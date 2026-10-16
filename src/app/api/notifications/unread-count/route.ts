import { countMyUnreadNotifications } from '@/modules/notifications';
import { getSession } from '@/shared/auth';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.notifications');
const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Число непрочитанных — опрос счётчика колокольчика. */
export async function GET(): Promise<Response> {
  try {
    const session = await getSession();
    if (!session) {
      log.warn('[api.notifications.unreadCount] no session');
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }
    const unreadCount = await countMyUnreadNotifications(session);
    return Response.json({ unreadCount }, { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/notifications/unread-count' });
  }
}
