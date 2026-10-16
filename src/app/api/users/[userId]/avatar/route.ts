import { getAvatarDownload } from '@/modules/profiles';
import { getSession } from '@/shared/auth';
import { NotFoundError, toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.avatar');

/**
 * Фото профиля: проверка доступа → 302 на короткоживущую presigned-ссылку. Адрес с `?v=` меняется
 * при замене фото, поэтому редирект можно ненадолго кешировать в браузере. Без сессии и без
 * доступа — 404: существование пользователя не раскрывается.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/users/[userId]/avatar'>,
): Promise<Response> {
  const { userId } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) return notFound();

    const { url } = await getAvatarDownload(session, userId);
    log.debug({ userId, viewerId: session.user.id }, '[api.avatar] redirect');
    return new Response(null, {
      status: 302,
      headers: {
        'Cache-Control': 'private, max-age=300',
        Location: url,
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    return toErrorResponse(error, { route: 'GET /api/users/[userId]/avatar', userId });
  }
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
