import type { MemberCardData } from '@/components/users/member-card';
import { getProfileCards } from '@/modules/profiles';
import { getMemberTaskSummary } from '@/modules/tasks';
import { getMember, listMyWorkspaces } from '@/modules/workspaces';
import { getSession } from '@/shared/auth';
import { ForbiddenError, NotFoundError, toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.memberCard');
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: NO_STORE });
}

/**
 * Карточка участника при наведении. Пространство — по slug из адреса страницы, только среди
 * пространств смотрящего; доступ к участнику — как у страницы профиля. Чужое — 404.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/w/[workspaceSlug]/members/[userId]/card'>,
): Promise<Response> {
  const { workspaceSlug, userId } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) return notFound();

    const workspace = (await listMyWorkspaces(session)).find((item) => item.slug === workspaceSlug);
    if (!workspace) {
      log.warn(
        { workspaceSlug, viewerId: session.user.id },
        '[api.memberCard] workspace not found',
      );
      return notFound();
    }
    const member = await getMember(session, workspace.id, userId);
    const [cards, summary] = await Promise.all([
      getProfileCards([userId]),
      getMemberTaskSummary(session, workspace.id, userId),
    ]);
    const card = cards.get(userId);
    const body: MemberCardData = {
      userId,
      name: member.name,
      email: member.email,
      image: card?.image ?? null,
      position: card?.position ?? null,
      role: member.role,
      isAgent: member.isAgent,
      responsibleName: member.responsible?.name ?? null,
      openCount: summary.openCount,
      overdueCount: summary.overdueCount,
    };
    log.debug({ workspaceId: workspace.id, userId, viewerId: session.user.id }, '[api.memberCard]');
    return Response.json(body, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      log.warn({ workspaceSlug, userId }, '[api.memberCard] denied');
      return notFound();
    }
    return toErrorResponse(error, {
      route: 'GET /api/w/[workspaceSlug]/members/[userId]/card',
      workspaceSlug,
      userId,
    });
  }
}
