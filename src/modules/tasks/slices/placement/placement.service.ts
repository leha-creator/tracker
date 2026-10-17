import 'server-only';

import { ARCHIVED_PROJECT_MESSAGE, isEntityId, type StatusCategory } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import {
  isForeignKeyViolation,
  isUniqueViolation,
  prisma,
  type TransactionClient,
} from '@/shared/db';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  ARCHIVED_TASK_MESSAGE,
  assertCanPlace,
  type HistoryAuthor,
  comparePositions,
  positionAfter,
  rekeyColumn,
  resolveMovePosition,
  TaskPlacement,
  type ColumnCard,
  type MovePosition,
} from '../../models';
import {
  GITHUB_HISTORY_AUTHOR,
  historyAuthorOf,
  recordHistory,
  statusSnapshots,
} from '../history/history.service';
import { emitTaskEvent } from '../realtime/task-events.service';
import { notifyWatchersAboutStatus, type StatusChangeNotice } from '../watcher/watcher.service';
import { placementRepository } from './placement.repository';

const log = createLogger('tasks.placement');

interface PlacementRef {
  workspaceId: string;
  taskId: string;
  projectId: string;
}

function assertIds(ref: PlacementRef, statusId?: string): void {
  if (!isEntityId(ref.taskId)) throw new NotFoundError('Задача не найдена');
  if (!isEntityId(ref.projectId)) throw new NotFoundError('Проект не найден');
  if (statusId !== undefined && !isEntityId(statusId)) throw new NotFoundError('Статус не найден');
}

/** Статус пространства по id или NOT_FOUND. */
async function loadStatus(tx: TransactionClient, workspaceId: string, statusId: string) {
  const status = await placementRepository.findStatus(tx, workspaceId, statusId);
  if (!status) {
    log.warn({ workspaceId, statusId }, '[placement] status not found in workspace');
    throw new NotFoundError('Статус не найден');
  }
  return status;
}

/**
 * Задача и проект доступны для изменения: есть в пространстве и не в архиве. Для системы
 * (`skip`) возвращает false вместо ошибки — архивные задачи и проекты она пропускает.
 */
async function checkActive(
  tx: TransactionClient,
  ref: PlacementRef,
  mode: 'reject' | 'skip' = 'reject',
): Promise<boolean> {
  const state = await placementRepository.findArchiveState(
    tx,
    ref.workspaceId,
    ref.taskId,
    ref.projectId,
  );
  if (!state) {
    if (mode === 'skip') return false;
    throw new NotFoundError('Задача или проект не найдены');
  }
  if (!state.taskArchived && !state.projectArchived) return true;
  if (mode === 'skip') {
    log.debug({ ...ref, ...state }, '[placement] archived, skipped by system');
    return false;
  }
  log.warn({ ...ref, ...state }, '[placement] change of archived task or project rejected');
  throw new ValidationError(state.taskArchived ? ARCHIVED_TASK_MESSAGE : ARCHIVED_PROJECT_MESSAGE);
}

/** Имена смены статуса — для уведомления наблюдателей после фиксации транзакции. */
type StatusChangeNames = Pick<StatusChangeNotice, 'projectName' | 'fromStatus' | 'toStatus'>;

/**
 * Запись истории о смене статуса размещения (снимок имён статусов и проекта). Возвращает имена
 * для уведомления; null — статус не найден (удалён параллельно).
 */
async function recordStatusChange(
  tx: TransactionClient,
  ref: PlacementRef,
  author: HistoryAuthor,
  fromStatusId: string,
  toStatusId: string,
): Promise<StatusChangeNames | null> {
  const refs = await statusSnapshots(tx, ref.workspaceId, [fromStatusId, toStatusId]);
  const from = refs.get(fromStatusId);
  const to = refs.get(toStatusId);
  if (!from || !to) return null;
  await recordHistory(tx, {
    workspaceId: ref.workspaceId,
    taskId: ref.taskId,
    author,
    changes: [{ kind: 'status', data: { project: to.project, from: from.status, to: to.status } }],
  });
  return { projectName: to.project.name, fromStatus: from.status.name, toStatus: to.status.name };
}

/** Уведомление наблюдателей о зафиксированной смене статуса (не бросает). */
async function notifyStatusWatchers(
  ref: PlacementRef,
  names: StatusChangeNames | null,
  actor: StatusChangeNotice['actor'],
  systemName?: string,
): Promise<void> {
  if (!names) return;
  const recipients = await notifyWatchersAboutStatus({
    workspaceId: ref.workspaceId,
    taskId: ref.taskId,
    ...names,
    actor,
    systemName,
  });
  log.debug({ taskId: ref.taskId, recipients }, '[placement] watchers notified');
}

function actorOf(session: AuthSession): StatusChangeNotice['actor'] {
  return { id: session.user.id, name: session.user.name };
}

type MoveInput = PlacementRef & { statusId: string; prevTaskId: string | null };

function alreadyPlaced(): ConflictError {
  return new ConflictError('Задача уже есть в этом проекте', {
    fieldErrors: { projectId: ['Задача уже есть в этом проекте'] },
  });
}

/** Добавляет задачу в проект: в конец колонки выбранного статуса. */
export async function addToProject(
  session: AuthSession,
  input: PlacementRef & { statusId: string },
): Promise<void> {
  const { workspaceId, taskId, projectId, statusId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId, statusId },
    '[placement.addToProject] start',
  );

  try {
    await prisma.$transaction(async (tx) => {
      await checkActive(tx, input);
      const status = await loadStatus(tx, workspaceId, statusId);
      if (status.projectId !== projectId) {
        log.warn({ workspaceId, statusId, projectId }, '[placement] status of another project');
        throw new ValidationError('Статус не принадлежит выбранному проекту', {
          fieldErrors: { statusId: ['Выберите статус этого проекта'] },
        });
      }
      const projectIds = await placementRepository.listProjectIds(tx, workspaceId, taskId);
      try {
        assertCanPlace(projectIds, projectId);
      } catch (error) {
        log.warn(
          { workspaceId, taskId, projectId, placements: projectIds.length },
          '[placement.addToProject] rejected',
        );
        throw error;
      }
      const last = await placementRepository.lastPosition(tx, workspaceId, projectId, statusId);
      await placementRepository.create(tx, {
        workspaceId,
        taskId,
        projectId,
        statusId,
        position: positionAfter(last),
      });
      const snapshot = (await statusSnapshots(tx, workspaceId, [statusId])).get(statusId);
      if (snapshot) {
        await recordHistory(tx, {
          workspaceId,
          taskId,
          author: historyAuthorOf(session),
          changes: [{ kind: 'project_added', data: snapshot }],
        });
      }
    });
  } catch (error) {
    // Предварительная проверка выше; P2002 — только при гонке двух одинаковых запросов.
    if (isUniqueViolation(error)) {
      log.warn({ workspaceId, taskId, projectId }, '[placement.addToProject] race: already placed');
      throw alreadyPlaced();
    }
    throw error;
  }
  log.info({ workspaceId, taskId, projectId, statusId }, '[placement] added');
  await emitPlacementEvent(session, input);
}

/** Сигнал реалтайма: изменилась одна доска (и панель этой задачи). */
function emitPlacementEvent(session: AuthSession | null, input: PlacementRef): Promise<void> {
  return emitTaskEvent(session, {
    workspaceId: input.workspaceId,
    kind: 'placement.changed',
    taskId: input.taskId,
    projectIds: [input.projectId],
  });
}

/** Меняет статус задачи в проекте: карточка встаёт в конец новой колонки. */
export async function changeStatus(
  session: AuthSession,
  input: PlacementRef & { statusId: string },
): Promise<void> {
  const { workspaceId, taskId, projectId, statusId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input, statusId);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId, statusId },
    '[placement.changeStatus] start',
  );

  const { from, names } = await applyStatusChange(input, historyAuthorOf(session), 'reject');
  if (from === statusId) {
    log.debug({ workspaceId, taskId, projectId, statusId }, '[placement.changeStatus] unchanged');
    return;
  }
  log.info({ workspaceId, taskId, projectId, from, to: statusId }, '[placement] status changed');
  await emitPlacementEvent(session, input);
  await notifyStatusWatchers(input, names, actorOf(session));
}

/**
 * Смена статуса от имени системы (интеграции), без сессии: проверки «статус ∈ проект» и
 * «задача в проекте» те же, что у changeStatus.
 * Только для доверенных вызывающих — например, обработчика вебхука GitHub с проверенной
 * подписью; права пользователя здесь не проверяются. Возвращает true, если статус изменился.
 */
export async function changePlacementStatusBySystem(
  input: PlacementRef & { statusId: string; reason: string },
): Promise<boolean> {
  const { workspaceId, taskId, projectId, statusId, reason } = input;
  assertIds(input, statusId);
  const { from, names } = await applyStatusChange(input, GITHUB_HISTORY_AUTHOR, 'skip');
  if (from === statusId) {
    log.debug(
      { workspaceId, taskId, projectId, statusId, reason },
      '[placement.changeStatusBySystem] unchanged',
    );
    return false;
  }
  log.info(
    { workspaceId, taskId, projectId, from, to: statusId, reason },
    '[placement] status changed by system',
  );
  await emitPlacementEvent(null, input);
  await notifyStatusWatchers(input, names, null, 'GitHub');
  return true;
}

/** Статус размещения → в конец колонки нового статуса. Возвращает прежний статус и имена смены. */
async function applyStatusChange(
  input: PlacementRef & { statusId: string },
  author: HistoryAuthor,
  mode: 'reject' | 'skip',
): Promise<{ from: string; names: StatusChangeNames | null }> {
  const { workspaceId, taskId, projectId, statusId } = input;
  return prisma.$transaction(async (tx) => {
    // Архивное система пропускает — как «статус не изменился».
    if (!(await checkActive(tx, input, mode))) return { from: statusId, names: null };
    const row = await placementRepository.find(tx, workspaceId, taskId, projectId);
    if (!row) {
      log.warn({ workspaceId, taskId, projectId }, '[placement.changeStatus] not placed');
      throw new NotFoundError('Задачи нет в этом проекте');
    }
    if (row.statusId === statusId) return { from: row.statusId, names: null };

    const status = await loadStatus(tx, workspaceId, statusId);
    const placement = new TaskPlacement(row.taskId, row.projectId, row.statusId, row.position);
    const last = await placementRepository.lastPosition(tx, workspaceId, projectId, statusId);
    try {
      placement.moveTo({
        statusId: status.id,
        statusProjectId: status.projectId,
        position: positionAfter(last),
      });
    } catch (error) {
      log.warn({ workspaceId, taskId, projectId, statusId }, '[placement.changeStatus] rejected');
      throw error;
    }
    await placementRepository.updateStatus(
      tx,
      workspaceId,
      { taskId, projectId },
      { statusId: placement.statusId, position: placement.position },
    );
    const names = await recordStatusChange(tx, input, author, row.statusId, placement.statusId);
    return { from: row.statusId, names };
  });
}

/**
 * Размещения задач с категорией статуса — системное чтение для интеграций (автосмена статуса).
 * Только задачи пространства `workspaceId`.
 */
export async function listPlacementsForAutomation(
  workspaceId: string,
  taskIds: readonly string[],
): Promise<{ taskId: string; projectId: string; statusId: string; category: StatusCategory }[]> {
  const ids = [...new Set(taskIds)].filter(isEntityId);
  if (ids.length === 0) return [];
  const rows = await placementRepository.listWithCategory(workspaceId, ids);
  log.debug(
    { workspaceId, tasks: ids.length, placements: rows.length },
    '[placement.listForAutomation]',
  );
  return rows.map((row) => ({
    taskId: row.taskId,
    projectId: row.projectId,
    statusId: row.statusId,
    category: row.status.category,
  }));
}

/** Убирает задачу из проекта; сама задача остаётся в пространстве. */
export async function removeFromProject(session: AuthSession, input: PlacementRef): Promise<void> {
  const { workspaceId, taskId, projectId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input);
  log.debug(
    { userId: session.user.id, workspaceId, taskId, projectId },
    '[placement.removeFromProject] start',
  );

  await prisma.$transaction(async (tx) => {
    await checkActive(tx, input);
    const row = await placementRepository.find(tx, workspaceId, taskId, projectId);
    const snapshot =
      row && (await statusSnapshots(tx, workspaceId, [row.statusId])).get(row.statusId);
    const count = await placementRepository.delete(workspaceId, { taskId, projectId }, tx);
    if (count === 0) {
      log.warn({ workspaceId, taskId, projectId }, '[placement.removeFromProject] not placed');
      throw new NotFoundError('Задачи нет в этом проекте');
    }
    if (snapshot) {
      await recordHistory(tx, {
        workspaceId,
        taskId,
        author: historyAuthorOf(session),
        changes: [{ kind: 'project_removed', data: { project: snapshot.project } }],
      });
    }
  });
  log.info({ workspaceId, taskId, projectId }, '[placement] removed');
  await emitPlacementEvent(session, input);
}

/**
 * Перемещает карточку на доске: в колонку `statusId` сразу под `prevTaskId` (null — верх колонки).
 * Меняется одна строка; при равных ключах соседей колонка перенумеровывается в той же транзакции.
 */
export async function movePlacement(session: AuthSession, input: MoveInput): Promise<void> {
  const { workspaceId, taskId, projectId, statusId, prevTaskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  assertIds(input, statusId);
  if (prevTaskId !== null && !isEntityId(prevTaskId)) throw new NotFoundError('Задача не найдена');

  let result: { from: string; moved: boolean; names: StatusChangeNames | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      await checkActive(tx, input);
      const row = await placementRepository.find(tx, workspaceId, taskId, projectId);
      if (!row) {
        log.warn({ workspaceId, taskId, projectId }, '[placement.movePlacement] not placed');
        throw new NotFoundError('Задачи нет в этом проекте');
      }
      const statusProjectId =
        row.statusId === statusId
          ? row.projectId
          : (await loadStatus(tx, workspaceId, statusId)).projectId;

      const column = await placementRepository.listColumn(tx, workspaceId, projectId, statusId);
      column.sort(comparePositions);
      let move = resolveMove(input, column);
      if (move.kind === 'rekey') {
        const rest = column.filter((card) => card.taskId !== taskId);
        const keys = rekeyColumn(rest.length);
        const rekeyed = rest.map((card, index) => ({
          taskId: card.taskId,
          position: keys[index]!,
        }));
        await placementRepository.updatePositions(tx, workspaceId, projectId, rekeyed);
        log.warn(
          { workspaceId, projectId, statusId, cards: rekeyed.length },
          '[placement] column rekeyed',
        );
        move = resolveMove(input, rekeyed);
      }
      if (move.kind !== 'position') return { from: row.statusId, moved: false, names: null };

      const placement = new TaskPlacement(row.taskId, row.projectId, row.statusId, row.position);
      try {
        placement.moveTo({ statusId, statusProjectId, position: move.position });
      } catch (error) {
        log.warn(
          { workspaceId, taskId, projectId, statusId },
          '[placement.movePlacement] rejected',
        );
        throw error;
      }
      await placementRepository.updateStatus(
        tx,
        workspaceId,
        { taskId, projectId },
        { statusId: placement.statusId, position: placement.position },
      );
      const names =
        row.statusId !== placement.statusId
          ? await recordStatusChange(tx, input, historyAuthorOf(session), row.statusId, statusId)
          : null;
      return { from: row.statusId, moved: true, names };
    });
  } catch (error) {
    // Статус удалили параллельно с броском: составной FK размещения на статус.
    if (isForeignKeyViolation(error)) {
      log.warn(
        { workspaceId, taskId, projectId, statusId },
        '[placement.movePlacement] status gone',
      );
      throw new NotFoundError('Статус не найден');
    }
    throw error;
  }

  if (!result.moved) return;
  log.info(
    { workspaceId, taskId, projectId, from: result.from, to: statusId, userId: session.user.id },
    '[placement] moved',
  );
  await emitPlacementEvent(session, input);
  await notifyStatusWatchers(input, result.names, actorOf(session));
}

/** resolveMovePosition с логированием отклонённого якоря (устаревший или сама карточка). */
function resolveMove(input: MoveInput, column: readonly ColumnCard[]): MovePosition {
  try {
    return resolveMovePosition({ column, taskId: input.taskId, prevTaskId: input.prevTaskId });
  } catch (error) {
    const { workspaceId, taskId, projectId, statusId, prevTaskId } = input;
    log.warn(
      { workspaceId, taskId, projectId, statusId, prevTaskId },
      '[placement.movePlacement] anchor rejected',
    );
    throw error;
  }
}
