import type { NextRequest } from 'next/server';

import { isEntityId } from '@/modules/projects';
import { exportTasks, parseTaskListParams } from '@/modules/tasks';
import { listMyWorkspaces } from '@/modules/workspaces';
import { getSession } from '@/shared/auth';
import { NotFoundError, RateLimitError, toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { enforceRateLimit, getClientIp } from '@/shared/rate-limit';

const log = createLogger('tasks.export');
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function deny(status: 401 | 404, reason: string, context: object): Response {
  log.warn({ ...context, reason }, '[tasks.export] denied');
  return new Response(null, { status, headers: NO_STORE });
}

/**
 * CSV списка задач: параметры — как у страницы списка (без `page`). `projectId=<id>` —
 * вкладка «Список» проекта, иначе список пространства. Чужое пространство или проект — 404.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/w/[workspaceSlug]/tasks/export'>,
): Promise<Response> {
  const { workspaceSlug } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) return deny(401, 'unauthorized', { workspaceSlug });

    const userId = session.user.id;
    const workspace = (await listMyWorkspaces(session)).find((item) => item.slug === workspaceSlug);
    if (!workspace) return deny(404, 'forbidden', { workspaceSlug, userId });

    try {
      await enforceRateLimit('tasks.export', { ip: getClientIp(request.headers), userId });
    } catch (error) {
      if (error instanceof RateLimitError) {
        log.warn({ workspaceId: workspace.id, userId }, '[tasks.export] rate limited');
      }
      throw error;
    }

    const params = request.nextUrl.searchParams;
    const rawProjectId = params.get('projectId');
    if (rawProjectId !== null && !isEntityId(rawProjectId)) {
      return deny(404, 'bad_project', { workspaceId: workspace.id, userId });
    }
    const projectId = rawProjectId ?? undefined;
    const query = parseTaskListParams(
      Object.fromEntries(params),
      projectId ? 'project' : 'workspace',
    );

    const result = await exportTasks(session, {
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      query,
      projectId,
    });
    return new Response(result.csv, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        ...(result.truncated ? { 'X-Tasker-Truncated': '1' } : {}),
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return deny(404, 'not_found', { workspaceSlug });
    return toErrorResponse(error, {
      route: 'GET /api/w/[workspaceSlug]/tasks/export',
      workspaceSlug,
    });
  }
}
