import 'server-only';

import { getTaskSummaries, listTasks, parseTaskListParams } from '@/modules/tasks';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { assertTaskLinksLimit, isDocumentEntityId } from '../../models';
import { toDocumentSummaryDto } from '../document/document.mapper';
import type { DocumentSummaryRow } from '../document/document.select';
import { loadDocument } from '../document/document.service';
import { getFolderPaths } from '../folder/folder.service';
import type { LinkedDocumentDto, LinkedTaskDto } from './task-link.dto';
import { taskLinkRepository } from './task-link.repository';

const log = createLogger('documents.taskLink');

/** Сколько вариантов показывает поиск для привязки. */
const LINK_SEARCH_LIMIT = 20;

function taskNotFound(context: Record<string, unknown>): NotFoundError {
  log.warn(context, '[taskLink] task not found in workspace');
  return new NotFoundError('Задача не найдена');
}

async function withFolderPaths(
  workspaceId: string,
  rows: DocumentSummaryRow[],
): Promise<LinkedDocumentDto[]> {
  if (rows.length === 0) return [];
  const paths = await getFolderPaths(workspaceId);
  return rows.map((row) => ({
    ...toDocumentSummaryDto(row),
    folderPath: row.folderId ? (paths.get(row.folderId) ?? '') : '',
  }));
}

/** Задача пространства или NOT_FOUND; краткие данные — через публичный API `tasks`. */
async function loadTask(session: AuthSession, workspaceId: string, taskId: string) {
  const [task] = isDocumentEntityId(taskId)
    ? await getTaskSummaries(session, workspaceId, [taskId])
    : [];
  if (!task) throw taskNotFound({ workspaceId, taskId, userId: session.user.id });
  return task;
}

/** Документы, привязанные к задаче (раздел «Документы» в задаче). */
export async function listTaskDocuments(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
): Promise<LinkedDocumentDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!isDocumentEntityId(taskId)) throw taskNotFound({ workspaceId, taskId });
  const rows = await taskLinkRepository.listDocumentsForTask(workspaceId, taskId);
  log.debug(
    { workspaceId, taskId, userId: session.user.id, count: rows.length },
    '[taskLink.listTaskDocuments]',
  );
  return withFolderPaths(workspaceId, rows);
}

/** Задачи, к которым привязан документ (блок «Задачи» документа). */
export async function listDocumentTasks(
  session: AuthSession,
  workspaceId: string,
  documentId: string,
): Promise<LinkedTaskDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  await loadDocument(workspaceId, documentId);
  const taskIds = await taskLinkRepository.listTaskIdsForDocument(workspaceId, documentId);
  const tasks = await getTaskSummaries(session, workspaceId, taskIds);
  log.debug(
    { workspaceId, documentId, userId: session.user.id, count: tasks.length },
    '[taskLink.listDocumentTasks]',
  );
  return tasks;
}

/**
 * Привязка документа к задаче — правка задачи, её может любой участник. Оба объекта — из
 * пространства, иначе NOT_FOUND. Повторная привязка ничего не меняет.
 */
export async function linkDocumentToTask(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; documentId: string },
): Promise<void> {
  const { workspaceId, taskId, documentId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId);
  log.debug({ workspaceId, taskId, documentId, userId }, '[taskLink.link] start');

  await loadDocument(workspaceId, documentId);
  await loadTask(session, workspaceId, taskId);
  if (await taskLinkRepository.exists(workspaceId, taskId, documentId)) {
    log.debug({ workspaceId, taskId, documentId }, '[taskLink.link] already linked');
    return;
  }
  const count = await taskLinkRepository.countForTask(workspaceId, taskId);
  try {
    assertTaskLinksLimit(count);
  } catch (error) {
    log.warn({ workspaceId, taskId, count }, '[taskLink.link] limit reached');
    throw error;
  }
  await taskLinkRepository.create({ workspaceId, taskId, documentId, createdById: userId });
  log.info({ workspaceId, taskId, documentId, userId }, '[taskLink] linked');
}

/** Отвязка; несуществующая связь — без ошибки. */
export async function unlinkDocumentFromTask(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; documentId: string },
): Promise<void> {
  const { workspaceId, taskId, documentId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId);
  const count = await taskLinkRepository.delete(workspaceId, taskId, documentId);
  if (count === 0) {
    log.debug({ workspaceId, taskId, documentId }, '[taskLink.unlink] not linked, skip');
    return;
  }
  log.info({ workspaceId, taskId, documentId, userId }, '[taskLink] unlinked');
}

/** Документы по названию для привязки к задаче (без уже привязанных к ней). */
export async function searchDocumentsForLink(
  session: AuthSession,
  input: { workspaceId: string; q: string; taskId?: string },
): Promise<LinkedDocumentDto[]> {
  const { workspaceId, q, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await taskLinkRepository.searchDocuments({
    workspaceId,
    q,
    excludeTaskId: taskId,
    take: LINK_SEARCH_LIMIT,
  });
  log.debug(
    { workspaceId, userId: session.user.id, queryLength: q.length, count: rows.length },
    '[taskLink.searchDocuments]',
  );
  return withFolderPaths(workspaceId, rows);
}

/** Задачи по номеру (`#42`) или названию для привязки документа (без уже привязанных). */
export async function searchTasksForLink(
  session: AuthSession,
  input: { workspaceId: string; q: string; documentId?: string },
): Promise<LinkedTaskDto[]> {
  const { workspaceId, q, documentId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const linked = new Set(
    documentId && isDocumentEntityId(documentId)
      ? await taskLinkRepository.listTaskIdsForDocument(workspaceId, documentId)
      : [],
  );
  const page = await listTasks(session, workspaceId, parseTaskListParams({ q }, 'workspace'));
  const tasks = page.items
    .filter((task) => !linked.has(task.id))
    .slice(0, LINK_SEARCH_LIMIT)
    .map((task) => ({
      id: task.id,
      number: task.number,
      key: task.key,
      title: task.title,
      isDone:
        task.placements.length > 0 &&
        task.placements.every((placement) => placement.statusCategory === 'done'),
    }));
  log.debug(
    { workspaceId, userId: session.user.id, queryLength: q.length, count: tasks.length },
    '[taskLink.searchTasks]',
  );
  return tasks;
}
