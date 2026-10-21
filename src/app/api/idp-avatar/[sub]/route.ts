import { getSession, idpAvatarSourceUrl, isValidIdpAvatarRef } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.idp-avatar');

/**
 * Фото из IdP plwedding ID (User.image = /api/idp-avatar/<sub>?v=<версия>, см. oidc-profile):
 * 302 на публичный роут аватара IdP. UserAvatar грузит только адреса приложения, поэтому фото
 * IdP идёт через этот роут. `v` меняется при смене фото — редирект можно долго кешировать.
 * Без сессии, без настроенного IdP и с неверными параметрами — 404.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<'/api/idp-avatar/[sub]'>,
): Promise<Response> {
  const { sub } = await ctx.params;
  const version = new URL(request.url).searchParams.get('v') ?? '';
  try {
    const issuer = getEnv().OIDC_ISSUER;
    if (!issuer || !isValidIdpAvatarRef(sub, version)) return notFound();
    const session = await getSession();
    if (!session) return notFound();

    log.debug({ sub, viewerId: session.user.id }, '[api.idp-avatar] redirect');
    return new Response(null, {
      status: 302,
      headers: {
        'Cache-Control': 'private, max-age=86400',
        Location: idpAvatarSourceUrl(issuer, sub, version),
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/idp-avatar/[sub]', sub });
  }
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
