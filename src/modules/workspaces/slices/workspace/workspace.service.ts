import 'server-only';

import { parseWorkspaceRole, requireWorkspaceAccess } from '@/shared/access';
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
        icon: resolveEntityIcon(workspace.icon, workspace.id),
        role: parsed,
        membersCount: workspace._count.members,
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
