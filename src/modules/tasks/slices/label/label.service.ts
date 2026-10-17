import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanAssignLabels,
  assertCanCreateLabel,
  diffLabels,
  labelNameKey,
  normalizeLabelName,
  parseLabelColor,
  type TaskLabelColor,
} from '../../models';
import { assertTaskActive } from '../task/task-archive.guard';
import { historyAuthorOf, recordHistory } from '../history/history.service';
import type { TaskLabelDto, TaskLabelRefDto } from './label.dto';
import { labelRepository } from './label.repository';

const log = createLogger('tasks.label');

function nameTaken(): ConflictError {
  const message = 'Метка с таким названием уже есть';
  return new ConflictError(message, { fieldErrors: { name: [message] } });
}

function labelNotFound(context: Record<string, unknown>): NotFoundError {
  log.warn(context, '[label] not found in workspace');
  return new NotFoundError('Метка не найдена');
}

function toLabelRef(row: { id: string; name: string; color: string }): TaskLabelRefDto {
  return { id: row.id, name: row.name, color: parseLabelColor(row.color) };
}

/** Метки пространства по имени (без учёта регистра) с числом задач. */
export async function listLabels(
  session: AuthSession,
  workspaceId: string,
): Promise<TaskLabelDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await labelRepository.listByWorkspace(workspaceId);
  log.debug({ userId: session.user.id, workspaceId, count: rows.length }, '[label.list]');
  return rows.map((row) => ({ ...toLabelRef(row), tasksCount: row._count.assignments }));
}

/** Новая метка пространства — может любой участник (метки ставят прямо из задачи). */
export async function createLabel(
  session: AuthSession,
  input: { workspaceId: string; name: string; color: TaskLabelColor },
): Promise<TaskLabelDto> {
  const { workspaceId, color } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const name = normalizeLabelName(input.name);
  const nameKey = labelNameKey(name);

  const count = await labelRepository.countInWorkspace(workspaceId);
  try {
    assertCanCreateLabel(count);
  } catch (error) {
    log.warn({ workspaceId, count }, '[label.create] limit reached');
    throw error;
  }
  if (await labelRepository.isNameTaken(workspaceId, nameKey)) {
    log.warn({ workspaceId }, '[label.create] name taken');
    throw nameTaken();
  }
  try {
    const row = await labelRepository.create({ workspaceId, name, nameKey, color });
    log.info({ workspaceId, labelId: row.id, userId: session.user.id }, '[label] created');
    return { ...toLabelRef(row), tasksCount: 0 };
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** Переименование и цвет — право «Управление проектами». */
export async function updateLabel(
  session: AuthSession,
  input: { workspaceId: string; labelId: string; name: string; color: TaskLabelColor },
): Promise<void> {
  const { workspaceId, labelId, color } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  if (!isEntityId(labelId) || !(await labelRepository.findInWorkspace(workspaceId, labelId))) {
    throw labelNotFound({ workspaceId, labelId });
  }
  const name = normalizeLabelName(input.name);
  const nameKey = labelNameKey(name);
  if (await labelRepository.isNameTaken(workspaceId, nameKey, labelId)) {
    log.warn({ workspaceId, labelId }, '[label.update] name taken');
    throw nameTaken();
  }
  try {
    const count = await labelRepository.update(workspaceId, labelId, { name, nameKey, color });
    if (count === 0) throw labelNotFound({ workspaceId, labelId });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  log.info({ workspaceId, labelId, userId: session.user.id }, '[label] updated');
}

/** Удаление метки снимает её со всех задач (каскад связей) — право «Управление проектами». */
export async function deleteLabel(
  session: AuthSession,
  input: { workspaceId: string; labelId: string },
): Promise<void> {
  const { workspaceId, labelId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  const count = isEntityId(labelId) ? await labelRepository.delete(workspaceId, labelId) : 0;
  if (count === 0) throw labelNotFound({ workspaceId, labelId });
  log.info({ workspaceId, labelId, userId: session.user.id }, '[label] deleted');
}

/**
 * Заменяет метки задачи. Все метки — из того же пространства, иначе NOT_FOUND. Изменение
 * пишется в историю задачи.
 */
export async function setTaskLabels(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; labelIds: string[] },
): Promise<TaskLabelRefDto[]> {
  const { workspaceId, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) throw new NotFoundError('Задача не найдена');
  const labelIds = [...new Set(input.labelIds)];
  try {
    assertCanAssignLabels(labelIds.length);
  } catch (error) {
    log.warn({ workspaceId, taskId, count: labelIds.length }, '[label.assign] limit');
    throw error;
  }
  if (!labelIds.every(isEntityId)) throw labelNotFound({ workspaceId, taskId });

  const { labels, added, removed } = await prisma.$transaction(async (tx) => {
    await assertTaskActive(workspaceId, taskId, tx);
    const next = await labelRepository.findManyInWorkspace(tx, workspaceId, labelIds);
    if (next.length !== labelIds.length) {
      throw labelNotFound({ workspaceId, taskId, requested: labelIds.length, found: next.length });
    }
    const current = await labelRepository.listTaskLabels(tx, workspaceId, taskId);
    const diff = diffLabels(current, next);
    if (diff.added.length === 0 && diff.removed.length === 0) {
      return { labels: next, ...diff };
    }
    await labelRepository.replaceTaskLabels(tx, workspaceId, taskId, labelIds);
    const ref = (label: { id: string; name: string }) => ({ id: label.id, name: label.name });
    await recordHistory(tx, {
      workspaceId,
      taskId,
      author: historyAuthorOf(session),
      changes: [
        { kind: 'labels', data: { added: diff.added.map(ref), removed: diff.removed.map(ref) } },
      ],
    });
    return { labels: next, ...diff };
  });

  if (added.length === 0 && removed.length === 0) {
    log.debug({ workspaceId, taskId }, '[label.assign] unchanged');
  } else {
    log.info(
      {
        workspaceId,
        taskId,
        userId: session.user.id,
        added: added.length,
        removed: removed.length,
      },
      '[task] labels set',
    );
  }
  return labels.map(toLabelRef);
}

/**
 * Метки пространства по именам (без учёта регистра); недостающие создаются (для MCP: агент
 * передаёт имена). Возвращает метки в порядке имён.
 */
export async function ensureLabelsByNames(
  session: AuthSession,
  workspaceId: string,
  names: readonly string[],
): Promise<{ labels: TaskLabelRefDto[]; created: number }> {
  await requireWorkspaceAccess(session, workspaceId);
  // При повторе имени (без учёта регистра) остаётся первое написание.
  const byNameKey = new Map<string, string>();
  for (const raw of names) {
    const name = normalizeLabelName(raw);
    const key = labelNameKey(name);
    if (!byNameKey.has(key)) byNameKey.set(key, name);
  }
  const normalized = [...byNameKey.entries()];
  const existing = await labelRepository.findByNameKeys(
    workspaceId,
    normalized.map(([key]) => key),
  );
  const byKey = new Map(existing.map((row) => [row.nameKey, toLabelRef(row)]));
  let created = 0;
  for (const [key, name] of normalized) {
    if (byKey.has(key)) continue;
    byKey.set(key, await createLabel(session, { workspaceId, name, color: 'gray' }));
    created += 1;
  }
  log.debug({ workspaceId, requested: names.length, created }, '[label.ensureByNames]');
  return {
    labels: normalized.map(([key]) => byKey.get(key)).filter((label) => label !== undefined),
    created,
  };
}
