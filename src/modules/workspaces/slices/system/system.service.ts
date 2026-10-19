import 'server-only';

import { parseWorkspaceRole } from '@/shared/access';
import { resolveEntityIcon } from '@/shared/entity-icon';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { assertCanTransferOwnership } from '../../models';
import type {
  AdminWorkspaceDto,
  AdminWorkspaceMemberDto,
  AdminWorkspaceRowDto,
  AllWorkspacesDto,
  AllWorkspacesQuery,
  OwnershipTransferResultDto,
} from './system.dto';
import { systemRepository, type AdminWorkspaceRow } from './system.repository';

// Системные функции без проверки сессии: только для модуля admin, уже вызвавшего
// requireAdmin(). Автор действия (actorId) передаётся для логов; журнал пишет admin.
const log = createLogger('workspace.system');

function toRowDto(row: AdminWorkspaceRow): AdminWorkspaceRowDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: resolveEntityIcon(row.icon, row.id),
    taskKey: row.taskKey,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    storageQuotaMb: row.storageQuotaMb,
    owners: row.members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
    })),
    membersCount: row._count.members,
    agentsCount: row._count.agents,
    projectsCount: row._count.projects,
    tasksCount: row._count.tasks,
  };
}

async function loadRow(workspaceId: string, scope: string): Promise<AdminWorkspaceRow> {
  const row = await systemRepository.findRow(workspaceId);
  if (!row) {
    log.warn({ workspaceId }, `[${scope}] not found`);
    throw new NotFoundError('Пространство не найдено');
  }
  return row;
}

/** Число пространств ресурса (всего и в архиве) — для обзора админки. */
export function countAllWorkspaces(): Promise<{ total: number; archived: number }> {
  return systemRepository.countAll();
}

/** Все пространства ресурса: поиск, фильтр архива, сортировка, страница. */
export async function listAllWorkspaces(query: AllWorkspacesQuery): Promise<AllWorkspacesDto> {
  const { rows, total } = await systemRepository.list(query);
  log.debug({ page: query.page, archived: query.archived, total }, '[workspace.system.list]');
  return { items: rows.map(toRowDto), total };
}

/** Пространство с участниками — для карточки в админке. */
export async function getWorkspaceForAdmin(workspaceId: string): Promise<AdminWorkspaceDto> {
  const row = await loadRow(workspaceId, 'workspace.system.get');
  const members = await systemRepository.listMembers(workspaceId);
  log.debug({ workspaceId, members: members.length }, '[workspace.system.get]');
  return {
    ...toRowDto(row),
    members: members.flatMap((member): AdminWorkspaceMemberDto[] => {
      const role = parseWorkspaceRole(member.role);
      if (!role) return [];
      return [
        {
          memberId: member.id,
          userId: member.userId,
          name: member.user.name,
          email: member.user.email,
          image: member.user.image,
          role,
          isAgent: member.user.isAgent,
          joinedAt: member.createdAt,
        },
      ];
    }),
  };
}

/**
 * Архив или восстановление. Возвращает название и `changed: false`, если пространство уже в
 * нужном состоянии.
 */
export async function setWorkspaceArchivedBySystem(input: {
  workspaceId: string;
  archived: boolean;
  actorId: string;
}): Promise<{ name: string; changed: boolean }> {
  const scope = input.archived ? 'workspace.system.archive' : 'workspace.system.restore';
  const row = await loadRow(input.workspaceId, scope);
  const count = await systemRepository.setArchived(row.id, input.archived ? new Date() : null);
  log.info({ workspaceId: row.id, actorId: input.actorId, changed: count > 0 }, `[${scope}]`);
  return { name: row.name, changed: count > 0 };
}

/** Удаление навсегда — только из архива, с подтверждением названием (проверяет admin). */
export async function deleteWorkspaceBySystem(input: {
  workspaceId: string;
  actorId: string;
}): Promise<{ name: string }> {
  const row = await loadRow(input.workspaceId, 'workspace.system.delete');
  if (!row.archivedAt) {
    log.warn({ workspaceId: row.id, actorId: input.actorId }, '[workspace.system.delete] active');
    throw new ValidationError('Удалить навсегда можно только пространство из архива');
  }
  await systemRepository.delete(row.id);
  log.info(
    { workspaceId: row.id, slug: row.slug, actorId: input.actorId },
    '[workspace.system.delete]',
  );
  return { name: row.name };
}

/**
 * Назначает владельца из участников-людей; прежние владельцы по выбору становятся участниками.
 * В пространстве всегда остаётся хотя бы один владелец — новый.
 */
export async function transferWorkspaceOwnership(input: {
  workspaceId: string;
  newOwnerUserId: string;
  demotePreviousOwners: boolean;
  actorId: string;
}): Promise<OwnershipTransferResultDto> {
  const row = await loadRow(input.workspaceId, 'workspace.system.transferOwnership');
  const member = await systemRepository.findMember(row.id, input.newOwnerUserId);
  const role = member ? parseWorkspaceRole(member.role) : null;
  const candidate = member && role ? { ...member, role, isAgent: member.user.isAgent } : null;
  try {
    assertCanTransferOwnership(candidate, input.demotePreviousOwners);
  } catch (error) {
    log.warn(
      {
        workspaceId: row.id,
        userId: input.newOwnerUserId,
        actorId: input.actorId,
        reason: error instanceof Error ? error.message : String(error),
      },
      '[workspace.system.transferOwnership] rejected',
    );
    throw error;
  }
  const demotedCount = await systemRepository.transferOwnership({
    workspaceId: row.id,
    memberId: candidate.id,
    demotePreviousOwners: input.demotePreviousOwners,
  });
  log.info(
    { workspaceId: row.id, userId: input.newOwnerUserId, actorId: input.actorId, demotedCount },
    '[workspace.system.transferOwnership]',
  );
  return { workspaceName: row.name, ownerName: candidate.user.name, demotedCount };
}

/** Своя квота документов пространства, МБ; null — по умолчанию ресурса. */
export async function setWorkspaceStorageQuota(input: {
  workspaceId: string;
  quotaMb: number | null;
  actorId: string;
}): Promise<{ name: string }> {
  const row = await loadRow(input.workspaceId, 'workspace.system.setQuota');
  await systemRepository.setStorageQuota(row.id, input.quotaMb);
  log.info(
    { workspaceId: row.id, quotaMb: input.quotaMb, actorId: input.actorId },
    '[workspace.system.setQuota]',
  );
  return { name: row.name };
}
