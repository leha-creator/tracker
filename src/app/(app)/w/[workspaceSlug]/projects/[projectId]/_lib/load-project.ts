import 'server-only';

import { notFound } from 'next/navigation';
import { cache } from 'react';

import { getProject, projectIdSchema } from '@/modules/projects';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

/**
 * Пространство и проект для страниц `/w/[workspaceSlug]/projects/[projectId]/*`.
 * Невалидный id, чужой или несуществующий проект → 404. Один раз за запрос (layout + страница).
 */
export const loadProjectPage = cache(async (workspaceSlug: string, projectId: string) => {
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  const context = await requireWorkspaceAccessBySlug(workspaceSlug);
  try {
    const project = await getProject(context.session, context.workspace.id, projectId);
    return { ...context, project };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
