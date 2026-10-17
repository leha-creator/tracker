import { listMyWorkspaces } from '@/modules/workspaces';
import { requireWorkspaceAccess } from '@/shared/access';
import { getSession } from '@/shared/auth';
import { toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { acquireSseConnection, createWorkspaceEventStream, SSE_HEADERS } from '@/shared/realtime';

const log = createLogger('realtime.sse');
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function reject(status: 401 | 404 | 429, reason: string, context: object): Response {
  log.warn({ ...context, reason }, '[realtime.sse] rejected');
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * Поток событий пространства (SSE). В событиях только идентификаторы — клиент по ним обновляет
 * страницу обычными запросами. Пространство — по slug, только среди своих неархивных: чужое — 404.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<'/api/realtime/w/[workspaceSlug]'>,
): Promise<Response> {
  const { workspaceSlug } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) return reject(401, 'unauthorized', { workspaceSlug });

    const userId = session.user.id;
    const workspace = (await listMyWorkspaces(session)).find((item) => item.slug === workspaceSlug);
    if (!workspace) return reject(404, 'forbidden', { workspaceSlug, userId });
    if (!acquireSseConnection(userId)) {
      return reject(429, 'too_many', { workspaceId: workspace.id, userId });
    }

    const stream = createWorkspaceEventStream({
      workspaceId: workspace.id,
      userId,
      signal: request.signal,
      recheckAccess: async () => {
        await requireWorkspaceAccess(session, workspace.id);
        return true;
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/realtime/w/[workspaceSlug]', workspaceSlug });
  }
}
