import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess, type WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanDeleteComment,
  assertCanEditComment,
  canDeleteComment,
  canEditComment,
  TASK_COMMENTS_PAGE_SIZE,
} from '../../models';
import { toUserDto } from '../task/task.mapper';
import type { TaskCommentDto, TaskCommentsDto } from './comment.dto';
import { commentRepository, type CommentRow } from './comment.repository';

const log = createLogger('tasks.comment');

interface CommentKey {
  workspaceId: string;
  taskId: string;
  commentId: string;
}

function toCommentDto(row: CommentRow, access: WorkspaceAccess): TaskCommentDto {
  return {
    id: row.id,
    body: row.body,
    author: toUserDto(row.author),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    canEdit: canEditComment(row, access),
    canDelete: canDeleteComment(row, access),
  };
}

function taskNotFound(workspaceId: string, taskId: string): NotFoundError {
  log.warn({ workspaceId, taskId }, '[comment] task not found');
  return new NotFoundError('Задача не найдена');
}

async function loadComment(key: CommentKey): Promise<CommentRow> {
  const valid = isEntityId(key.taskId) && isEntityId(key.commentId);
  const row = valid ? await commentRepository.find(key) : null;
  if (!row) {
    log.warn(key, '[comment] not found');
    throw new NotFoundError('Комментарий не найден');
  }
  return row;
}

/** Комментарии задачи от старых к новым: последние `TASK_COMMENTS_PAGE_SIZE` или все. */
export async function listTaskComments(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
  options: { all?: boolean } = {},
): Promise<TaskCommentsDto> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) throw taskNotFound(workspaceId, taskId);

  const all = options.all ?? false;
  const { total, rows } = await commentRepository.listForTask(
    workspaceId,
    taskId,
    all ? undefined : TASK_COMMENTS_PAGE_SIZE,
  );
  log.debug({ userId: access.userId, workspaceId, taskId, all, total }, '[comment.list]');

  return {
    items: rows.map((row) => toCommentDto(row, access)).reverse(),
    total,
    truncated: rows.length < total,
  };
}

export async function createComment(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; body: string },
): Promise<{ commentId: string }> {
  const { workspaceId, taskId, body } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  const exists = isEntityId(taskId) && (await commentRepository.taskExists(workspaceId, taskId));
  if (!exists) throw taskNotFound(workspaceId, taskId);

  const { id } = await commentRepository.create({
    workspaceId,
    taskId,
    authorId: access.userId,
    body,
  });
  log.info(
    { workspaceId, taskId, commentId: id, userId: access.userId, length: body.length },
    '[comment] created',
  );
  return { commentId: id };
}

/** Новый текст комментария — только автор. Тот же текст — без изменений и без отметки правки. */
export async function updateComment(
  session: AuthSession,
  input: CommentKey & { body: string },
): Promise<void> {
  const { body, ...key } = input;
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  const comment = await loadComment(key);
  try {
    assertCanEditComment(comment, access);
  } catch (error) {
    log.warn({ ...key, userId: access.userId, role: access.role }, '[comment.update] forbidden');
    throw error;
  }

  if (comment.body === body) {
    log.debug(key, '[comment.update] text unchanged');
    return;
  }
  const count = await commentRepository.updateBody(key, body);
  if (count === 0) throw new NotFoundError('Комментарий не найден');
  log.info({ ...key, userId: access.userId, length: body.length }, '[comment] updated');
}

/** Удаление — автор или владелец пространства. */
export async function deleteComment(session: AuthSession, key: CommentKey): Promise<void> {
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  const comment = await loadComment(key);
  try {
    assertCanDeleteComment(comment, access);
  } catch (error) {
    log.warn({ ...key, userId: access.userId, role: access.role }, '[comment.delete] forbidden');
    throw error;
  }

  const count = await commentRepository.delete(key);
  if (count === 0) throw new NotFoundError('Комментарий не найден');
  log.info(
    { ...key, userId: access.userId, byOwner: comment.authorId !== access.userId },
    '[comment] deleted',
  );
}
