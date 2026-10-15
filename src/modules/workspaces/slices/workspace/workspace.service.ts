import 'server-only';

import { parseWorkspaceRole, requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { InternalError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { resolveSlug } from '../../models';
import { callOrganizationApi } from '../../organization-api';
import type { WorkspaceListItemDto, WorkspaceSummaryDto } from './workspace.dto';
import { workspaceRepository } from './workspace.repository';

const log = createLogger('workspaces.workspace');

export async function listMyWorkspaces(session: AuthSession): Promise<WorkspaceListItemDto[]> {
  const userId = session.user.id;
  log.debug({ userId }, '[workspace.listMyWorkspaces]');
  const rows = await workspaceRepository.listForUser(userId);
  return rows.flatMap(({ role, workspace }) => {
    const parsed = parseWorkspaceRole(role);
    if (!parsed) {
      log.warn(
        { userId, workspaceId: workspace.id, role },
        '[workspace.listMyWorkspaces] unknown role',
      );
      return [];
    }
    return [
      {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        role: parsed,
        membersCount: workspace._count.members,
      },
    ];
  });
}

export async function createWorkspace(
  session: AuthSession,
  input: { name: string; slug?: string },
): Promise<WorkspaceSummaryDto> {
  const userId = session.user.id;
  const slug = resolveSlug(input.name, input.slug);
  log.debug({ userId, slug }, '[workspace.createWorkspace] start');

  const created = await callOrganizationApi((api, headers) =>
    api.createOrganization({
      body: { name: input.name, slug, keepCurrentActiveOrganization: true },
      headers,
    }),
  );
  if (!created) throw new InternalError('Плагин не вернул созданное пространство');

  log.info({ workspaceId: created.id, slug: created.slug, userId }, '[workspace] created');
  return { id: created.id, slug: created.slug, name: created.name };
}

export async function renameWorkspace(
  session: AuthSession,
  input: { workspaceId: string; name: string },
): Promise<WorkspaceSummaryDto> {
  await requireWorkspaceAccess(session, input.workspaceId, 'owner');
  log.debug(
    { userId: session.user.id, workspaceId: input.workspaceId },
    '[workspace.rename] start',
  );

  const updated = await callOrganizationApi((api, headers) =>
    api.updateOrganization({
      body: { organizationId: input.workspaceId, data: { name: input.name } },
      headers,
    }),
  );
  if (!updated) throw new NotFoundError('Пространство не найдено');

  log.info({ workspaceId: updated.id, userId: session.user.id }, '[workspace] renamed');
  return { id: updated.id, slug: updated.slug, name: updated.name };
}

export async function deleteWorkspace(
  session: AuthSession,
  input: { workspaceId: string; confirmName: string },
): Promise<void> {
  await requireWorkspaceAccess(session, input.workspaceId, 'owner');
  const workspace = await workspaceRepository.findById(input.workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');

  if (input.confirmName.trim() !== workspace.name) {
    throw new ValidationError('Название не совпадает', {
      fieldErrors: { confirmName: ['Введите название пространства точно'] },
    });
  }

  await callOrganizationApi((api, headers) =>
    api.deleteOrganization({ body: { organizationId: input.workspaceId }, headers }),
  );
  log.info(
    { workspaceId: workspace.id, slug: workspace.slug, userId: session.user.id },
    '[workspace] deleted',
  );
}
