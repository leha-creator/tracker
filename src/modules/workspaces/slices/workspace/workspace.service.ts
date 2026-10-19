import 'server-only';

import { parseWorkspaceRole, requireWorkspaceAccess } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation } from '@/shared/db';
import { resolveEntityIcon, type EntityIcon } from '@/shared/entity-icon';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  normalizeTaskKey,
  resolveSlug,
  suggestTaskKey,
  taskKeyWithSuffix,
  validateTaskKey,
} from '../../models';
import { callOrganizationApi } from '../../organization-api';
import type {
  WorkspaceListItemDto,
  WorkspaceSummaryDto,
  WorkspaceTaskKeyDto,
} from './workspace.dto';
import { workspaceRepository } from './workspace.repository';

const log = createLogger('workspaces.workspace');

/**
 * Пространства пользователя: по умолчанию активные (переключатель, главная, токены),
 * `archived` — архивные, где он владелец (раздел «Архивные пространства»).
 */
export async function listMyWorkspaces(
  session: AuthSession,
  options: { archived?: boolean } = {},
): Promise<WorkspaceListItemDto[]> {
  const userId = session.user.id;
  const archived = options.archived ?? false;
  log.debug({ userId, archived }, '[workspace.listMyWorkspaces]');
  const rows = await workspaceRepository.listForUser(userId, archived);
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
        icon: resolveEntityIcon(workspace.icon, workspace.id),
        role: parsed,
        membersCount: workspace._count.members,
        archivedAt: workspace.archivedAt,
      },
    ];
  });
}

/** Сколько вариантов с цифрой (TSK2, TSK3…) пробовать, если предложенный ключ занят. */
const TASK_KEY_ATTEMPTS = 5;

function taskKeyTaken(): ConflictError {
  const message = 'Этот ключ уже занят другим пространством';
  return new ConflictError(message, { fieldErrors: { taskKey: [message] } });
}

/**
 * Проставляет ключ задач новому пространству: заданный вручную (уже проверен на занятость)
 * или предложенный, при конфликте — с цифрой. Не бросает: без ключа пространство работает
 * (задачи — #42), владелец задаст ключ в настройках.
 */
async function assignTaskKey(workspaceId: string, base: string): Promise<string | null> {
  for (let attempt = 0; attempt < TASK_KEY_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : taskKeyWithSuffix(base, attempt);
    try {
      if (attempt > 0 && (await workspaceRepository.isTaskKeyTaken(candidate))) {
        log.debug({ workspaceId, attempt }, '[workspace.taskKey] candidate taken');
        continue;
      }
      await workspaceRepository.setTaskKey(workspaceId, candidate);
      log.info({ workspaceId, from: null, to: candidate }, '[workspace] task key set');
      return candidate;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        log.error({ err: error, workspaceId }, '[workspace.taskKey] assign failed');
        return null;
      }
      log.warn({ workspaceId, attempt }, '[workspace.taskKey] conflict, retry');
    }
  }
  log.error({ workspaceId, base }, '[workspace.taskKey] no free key, left empty');
  return null;
}

/** Иконка нового пространства. Не бросает: без неё показывается иконка по id. */
async function assignIcon(workspaceId: string, icon: EntityIcon): Promise<void> {
  try {
    await workspaceRepository.setIcon(workspaceId, icon);
    log.info({ workspaceId, icon }, '[workspace] icon set');
  } catch (error) {
    log.error({ err: error, workspaceId, icon }, '[workspace.icon] assign failed');
  }
}

export async function createWorkspace(
  session: AuthSession,
  input: { name: string; slug?: string; taskKey?: string; icon?: EntityIcon },
): Promise<WorkspaceSummaryDto> {
  const userId = session.user.id;
  const slug = resolveSlug(input.name, input.slug);
  const taskKey = input.taskKey ?? suggestTaskKey(input.name);
  log.debug(
    { userId, slug, taskKey, manualTaskKey: input.taskKey !== undefined },
    '[workspace.createWorkspace] start',
  );
  // Ключ, введённый вручную, проверяем до создания: после — пространство уже существует.
  if (input.taskKey !== undefined && (await workspaceRepository.isTaskKeyTaken(input.taskKey))) {
    log.warn({ userId, taskKey: input.taskKey }, '[workspace.createWorkspace] task key taken');
    throw taskKeyTaken();
  }

  const created = await callOrganizationApi((api, headers) =>
    api.createOrganization({
      body: { name: input.name, slug, keepCurrentActiveOrganization: true },
      headers,
    }),
  );
  if (!created) throw new InternalError('Плагин не вернул созданное пространство');

  log.info({ workspaceId: created.id, slug: created.slug, userId }, '[workspace] created');
  await recordAuditEvent({
    kind: 'workspace.created',
    actor: auditActorFromSession(session),
    workspaceId: created.id,
    data: { workspaceName: created.name },
  });
  await assignTaskKey(created.id, taskKey);
  if (input.icon) await assignIcon(created.id, input.icon);
  return { id: created.id, slug: created.slug, name: created.name };
}

/** Меняет ключ задач (только владелец). Уже созданные связи с GitHub остаются. */
export async function updateTaskKey(
  session: AuthSession,
  input: { workspaceId: string; taskKey: string },
): Promise<{ taskKey: string }> {
  const { workspaceId } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const taskKey = validateTaskKey(input.taskKey);
  const workspace = await workspaceRepository.findById(workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');
  log.debug(
    { userId: session.user.id, workspaceId, from: workspace.taskKey, to: taskKey },
    '[workspace.updateTaskKey] start',
  );
  if (workspace.taskKey === taskKey) return { taskKey };

  try {
    await workspaceRepository.setTaskKey(workspaceId, taskKey);
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn({ workspaceId, taskKey }, '[workspace.updateTaskKey] task key taken');
      throw taskKeyTaken();
    }
    throw error;
  }
  log.info(
    { workspaceId, from: workspace.taskKey, to: taskKey, userId: session.user.id },
    '[workspace] task key changed',
  );
  return { taskKey };
}

/**
 * Пространства по ключам задач — системное чтение без сессии (вебхуки GitHub):
 * вызывающий сам отвечает за доверие к источнику. Ключи нормализуются.
 */
export async function findWorkspacesByTaskKeys(
  taskKeys: readonly string[],
): Promise<WorkspaceTaskKeyDto[]> {
  const keys = [...new Set(taskKeys.map(normalizeTaskKey))];
  if (keys.length === 0) return [];
  const rows = await workspaceRepository.findByTaskKeys(keys);
  log.debug({ requested: keys.length, found: rows.length }, '[workspace.findByTaskKeys]');
  return rows.flatMap((row) => (row.taskKey ? [{ ...row, taskKey: row.taskKey }] : []));
}

export async function renameWorkspace(
  session: AuthSession,
  input: { workspaceId: string; name: string; icon?: EntityIcon },
): Promise<WorkspaceSummaryDto> {
  await requireWorkspaceAccess(session, input.workspaceId, 'owner');
  log.debug(
    { userId: session.user.id, workspaceId: input.workspaceId },
    '[workspace.rename] start',
  );
  const before = await workspaceRepository.findById(input.workspaceId);

  const updated = await callOrganizationApi((api, headers) =>
    api.updateOrganization({
      body: { organizationId: input.workspaceId, data: { name: input.name } },
      headers,
    }),
  );
  if (!updated) throw new NotFoundError('Пространство не найдено');
  // Иконка — не поле плагина: пишем сами, право владельца уже проверено.
  if (input.icon) await workspaceRepository.setIcon(input.workspaceId, input.icon);

  log.info(
    { workspaceId: updated.id, userId: session.user.id, icon: input.icon },
    '[workspace] renamed',
  );
  // Форма сохраняет и иконку: событие — только при смене названия.
  if (before && before.name !== updated.name) {
    await recordAuditEvent({
      kind: 'workspace.renamed',
      actor: auditActorFromSession(session),
      workspaceId: updated.id,
      data: { workspaceName: updated.name, previousName: before.name },
    });
  }
  return { id: updated.id, slug: updated.slug, name: updated.name };
}

function assertNameConfirmed(name: string, confirmName: string): void {
  if (confirmName.trim() !== name) {
    throw new ValidationError('Название не совпадает', {
      fieldErrors: { confirmName: ['Введите название пространства точно'] },
    });
  }
}

/**
 * Отправляет пространство в архив (владелец, подтверждение названием): оно пропадает
 * у участников, из MCP и интеграций; владелец может восстановить или удалить его.
 */
export async function archiveWorkspace(
  session: AuthSession,
  input: { workspaceId: string; confirmName: string },
): Promise<WorkspaceSummaryDto> {
  const { workspaceId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const workspace = await workspaceRepository.findById(workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');
  log.debug({ userId, workspaceId }, '[workspace.archive] start');
  try {
    assertNameConfirmed(workspace.name, input.confirmName);
  } catch (error) {
    log.warn({ workspaceId }, '[workspace.archive] confirmation mismatch');
    throw error;
  }

  await workspaceRepository.setArchived(workspaceId, new Date());
  log.info({ workspaceId, slug: workspace.slug, userId }, '[workspace] archived');
  await recordAuditEvent({
    kind: 'workspace.archived',
    actor: auditActorFromSession(session),
    workspaceId,
    data: { workspaceName: workspace.name },
  });
  return { id: workspace.id, slug: workspace.slug, name: workspace.name };
}

/** Возвращает пространство из архива (только владелец). */
export async function restoreWorkspace(
  session: AuthSession,
  input: { workspaceId: string },
): Promise<WorkspaceSummaryDto> {
  const { workspaceId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId, 'owner', { allowArchived: true });
  const workspace = await workspaceRepository.findById(workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');
  log.debug({ userId, workspaceId }, '[workspace.restore] start');

  const count = await workspaceRepository.setArchived(workspaceId, null);
  if (count === 0) {
    log.debug({ workspaceId }, '[workspace.restore] already active');
  } else {
    log.info({ workspaceId, slug: workspace.slug, userId }, '[workspace] restored');
    await recordAuditEvent({
      kind: 'workspace.restored',
      actor: auditActorFromSession(session),
      workspaceId,
      data: { workspaceName: workspace.name },
    });
  }
  return { id: workspace.id, slug: workspace.slug, name: workspace.name };
}

/** Удаляет навсегда пространство из архива (владелец, подтверждение названием). */
export async function deleteWorkspace(
  session: AuthSession,
  input: { workspaceId: string; confirmName: string },
): Promise<void> {
  await requireWorkspaceAccess(session, input.workspaceId, 'owner', { allowArchived: true });
  const workspace = await workspaceRepository.findById(input.workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');
  if (!workspace.archivedAt) {
    log.warn({ workspaceId: workspace.id }, '[workspace.delete] workspace is not archived');
    throw new ValidationError('Удалить навсегда можно только пространство из архива');
  }
  assertNameConfirmed(workspace.name, input.confirmName);

  await callOrganizationApi((api, headers) =>
    api.deleteOrganization({ body: { organizationId: input.workspaceId }, headers }),
  );
  log.info(
    { workspaceId: workspace.id, slug: workspace.slug, userId: session.user.id },
    '[workspace] deleted',
  );
  // Строки пространства уже нет: событие без workspaceId (иначе нарушится FK), название — в снимке.
  await recordAuditEvent({
    kind: 'workspace.deleted',
    actor: auditActorFromSession(session),
    data: { workspaceName: workspace.name },
  });
}
