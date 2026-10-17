import 'server-only';

import { notificationExcerpt, notify, type NotificationEvent } from '@/modules/notifications';
import { isEntityId } from '@/modules/projects';
import { listMemberIdentities } from '@/modules/workspaces';
import { requireWorkspaceAccess, type WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertCanDeleteComment,
  assertCanEditComment,
  canDeleteComment,
  canEditComment,
  extractMentions,
  formatTaskKey,
  mentionedUserIds,
  resolveCommentRecipients,
  TASK_COMMENTS_PAGE_SIZE,
  type MentionCandidate,
} from '../../models';
import { toAttachmentDto } from '../attachment/attachment.mapper';
import { attachmentRepository } from '../attachment/attachment.repository';
import { deleteStoredObjects } from '../attachment/attachment.storage';
import { emitTaskEvent } from '../realtime/task-events.service';
import { toCreatedVia, toUserDto } from '../task/task.mapper';
import { assertTaskActive } from '../task/task-archive.guard';
import { ensureWatchers, listWatcherIds } from '../watcher/watcher.service';
import type { TaskCommentDto, TaskCommentsDto } from './comment.dto';
import { commentRepository, type CommentRow, type CommentTaskRow } from './comment.repository';
import { EMPTY_COMMENT_MESSAGE } from './comment.schema';

const log = createLogger('tasks.comment');

interface CommentKey {
  workspaceId: string;
  taskId: string;
  commentId: string;
}

function toCommentDto(
  row: CommentRow,
  access: WorkspaceAccess,
  members: readonly MentionCandidate[],
): TaskCommentDto {
  return {
    id: row.id,
    body: row.body,
    mentions: extractMentions(row.body, members),
    author: toUserDto(row.author),
    createdVia: toCreatedVia(row.author, row.createdViaToken),
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    canEdit: canEditComment(row, access),
    canDelete: canDeleteComment(row, access),
    attachments: row.attachments.map((attachment) => toAttachmentDto(attachment, access)),
  };
}

function emptyComment(): ValidationError {
  return new ValidationError(EMPTY_COMMENT_MESSAGE, {
    fieldErrors: { body: [EMPTY_COMMENT_MESSAGE] },
  });
}

function taskNotFound(workspaceId: string, taskId: string): NotFoundError {
  log.warn({ workspaceId, taskId }, '[comment] task not found');
  return new NotFoundError('Задача не найдена');
}

async function loadTask(workspaceId: string, taskId: string): Promise<CommentTaskRow> {
  const task = isEntityId(taskId) ? await commentRepository.findTask(workspaceId, taskId) : null;
  if (!task) throw taskNotFound(workspaceId, taskId);
  return task;
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

/**
 * Уведомления о комментарии: упомянутым — `mention`, наблюдателям задачи (только для нового
 * комментария) — `task_comment`. При правке — только новые упоминания. Не бросает.
 */
async function notifyAboutComment(input: {
  session: AuthSession;
  task: CommentTaskRow;
  commentId: string;
  body: string;
  previousBody?: string;
}): Promise<void> {
  const { session, task, commentId, body, previousBody } = input;
  const actorId = session.user.id;
  try {
    const isNew = previousBody === undefined;
    const [members, watchers] = await Promise.all([
      listMemberIdentities(task.workspaceId),
      isNew ? listWatcherIds(task.workspaceId, task.id) : Promise.resolve([]),
    ]);
    const recipients = resolveCommentRecipients({
      actorId,
      mentioned: mentionedUserIds(body, members),
      previouslyMentioned:
        previousBody === undefined ? undefined : mentionedUserIds(previousBody, members),
      watchers,
    });
    log.debug(
      {
        workspaceId: task.workspaceId,
        taskId: task.id,
        commentId,
        mentions: recipients.mentions.length,
        watchers: recipients.watchers.length,
      },
      '[comment] notifications',
    );
    if (recipients.mentions.length === 0 && recipients.watchers.length === 0) return;

    const base = {
      workspaceId: task.workspaceId,
      actorId,
      taskId: task.id,
      commentId,
      payload: {
        workspaceSlug: task.workspace.slug,
        workspaceName: task.workspace.name,
        actorName: session.user.name,
        taskNumber: task.number,
        taskKey: formatTaskKey(task.number, task.workspace.taskKey),
        taskTitle: task.title,
        commentExcerpt: notificationExcerpt(body),
      },
    };
    const events: NotificationEvent[] = [
      ...recipients.mentions.map((recipientId) => ({
        ...base,
        type: 'mention' as const,
        recipientId,
      })),
      ...recipients.watchers.map((recipientId) => ({
        ...base,
        type: 'task_comment' as const,
        recipientId,
      })),
    ];
    await notify(events);
  } catch (error) {
    // notify не бросает; сюда попадает только сбой чтения участников.
    log.error({ err: error, taskId: task.id, commentId }, '[comment] notifications failed');
  }
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
  const [{ total, rows }, members] = await Promise.all([
    commentRepository.listForTask(workspaceId, taskId, all ? undefined : TASK_COMMENTS_PAGE_SIZE),
    listMemberIdentities(workspaceId),
  ]);
  const items = rows.map((row) => toCommentDto(row, access, members)).reverse();
  log.debug(
    {
      userId: access.userId,
      workspaceId,
      taskId,
      all,
      total,
      mentions: items.reduce((sum, item) => sum + item.mentions.length, 0),
    },
    '[comment.list]',
  );

  return { items, total, truncated: rows.length < total };
}

/**
 * Новый комментарий. Файлы — готовые черновики автора в этой задаче; привязываются в той же
 * транзакции: если часть не найдена, комментарий не создаётся. После сохранения — уведомления.
 */
export async function createComment(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; body: string; attachmentIds?: string[] },
): Promise<{ commentId: string }> {
  const { workspaceId, taskId, body } = input;
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  const access = await requireWorkspaceAccess(session, workspaceId);
  const task = await loadTask(workspaceId, taskId);
  await assertTaskActive(workspaceId, taskId);
  if (body === '' && attachmentIds.length === 0) throw emptyComment();
  const members = await listMemberIdentities(workspaceId);

  const id = await prisma.$transaction(async (tx) => {
    const comment = await commentRepository.create(
      {
        workspaceId,
        taskId,
        authorId: access.userId,
        body,
        createdViaTokenId: session.via?.tokenId ?? null,
      },
      tx,
    );
    if (attachmentIds.length > 0) {
      const bound = await attachmentRepository.bindToComment(tx, {
        ids: attachmentIds,
        workspaceId,
        taskId,
        uploaderId: access.userId,
        commentId: comment.id,
      });
      if (bound !== attachmentIds.length) {
        log.warn(
          { workspaceId, taskId, userId: access.userId, expected: attachmentIds.length, bound },
          '[comment.create] attachments not found',
        );
        throw new ValidationError('Файлы не найдены — загрузите их заново');
      }
    }
    // Автор и упомянутые начинают следить за задачей.
    await ensureWatchers(tx, workspaceId, taskId, [
      access.userId,
      ...mentionedUserIds(body, members),
    ]);
    return comment.id;
  });
  log.info(
    {
      workspaceId,
      taskId,
      commentId: id,
      userId: access.userId,
      length: body.length,
      attachments: attachmentIds.length,
      via: session.via?.tokenId ?? null,
    },
    '[comment] created',
  );
  await emitTaskEvent(session, { workspaceId, kind: 'comment.changed', taskId });
  await notifyAboutComment({ session, task, commentId: id, body });
  return { commentId: id };
}

/**
 * Новый текст комментария — только автор. Тот же текст — без изменений и без отметки правки.
 * Новые упоминания получают уведомление.
 */
export async function updateComment(
  session: AuthSession,
  input: CommentKey & { body: string },
): Promise<void> {
  const { body, ...key } = input;
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  await assertTaskActive(key.workspaceId, key.taskId);
  const comment = await loadComment(key);
  try {
    assertCanEditComment(comment, access);
  } catch (error) {
    log.warn({ ...key, userId: access.userId, role: access.role }, '[comment.update] forbidden');
    throw error;
  }

  if (body === '' && comment.attachments.length === 0) throw emptyComment();
  if (comment.body === body) {
    log.debug(key, '[comment.update] text unchanged');
    return;
  }
  const count = await commentRepository.updateBody(key, body);
  if (count === 0) throw new NotFoundError('Комментарий не найден');
  log.info({ ...key, userId: access.userId, length: body.length }, '[comment] updated');
  await emitTaskEvent(session, {
    workspaceId: key.workspaceId,
    kind: 'comment.changed',
    taskId: key.taskId,
  });

  const task = await commentRepository.findTask(key.workspaceId, key.taskId);
  if (task) {
    await notifyAboutComment({
      session,
      task,
      commentId: key.commentId,
      body,
      previousBody: comment.body,
    });
  }
}

/** Удаление — автор или владелец пространства. */
export async function deleteComment(session: AuthSession, key: CommentKey): Promise<void> {
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  await assertTaskActive(key.workspaceId, key.taskId);
  const comment = await loadComment(key);
  try {
    assertCanDeleteComment(comment, access);
  } catch (error) {
    log.warn({ ...key, userId: access.userId, role: access.role }, '[comment.delete] forbidden');
    throw error;
  }

  // Строки файлов удалит каскад, объекты хранилища — после удаления комментария.
  const storageKeys = await attachmentRepository.keysForComment(
    key.workspaceId,
    key.taskId,
    key.commentId,
  );
  const count = await commentRepository.delete(key);
  if (count === 0) throw new NotFoundError('Комментарий не найден');
  await deleteStoredObjects(storageKeys, key);
  log.info(
    {
      ...key,
      userId: access.userId,
      byOwner: comment.authorId !== access.userId,
      attachments: storageKeys.length,
    },
    '[comment] deleted',
  );
  await emitTaskEvent(session, {
    workspaceId: key.workspaceId,
    kind: 'comment.changed',
    taskId: key.taskId,
  });
}
