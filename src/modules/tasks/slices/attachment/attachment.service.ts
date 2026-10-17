import 'server-only';

import { randomUUID } from 'node:crypto';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess, type WorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import {
  createDownloadUrl,
  createUploadPost,
  headObject,
  readObjectPrefix,
} from '@/shared/storage';

import {
  assertAttachmentLimit,
  assertAttachmentSize,
  assertCanDeleteAttachment,
  assertCanRemoveFromComment,
  ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  ATTACHMENT_SIGNATURE_BYTES,
  ATTACHMENT_STALE_AFTER_MS,
  ATTACHMENT_UPLOAD_TTL_SECONDS,
  attachmentStorageKey,
  attachmentTypeOf,
  canViewAttachment,
  contentDisposition,
  fileExtension,
  matchesImageSignature,
  requiresSignatureCheck,
  resolveAttachmentType,
  sanitizeFileName,
  type AttachmentTarget,
} from '../../models';
import type { AttachmentUploadDto, TaskAttachmentDto } from './attachment.dto';
import { toAttachmentDto } from './attachment.mapper';
import { attachmentRepository } from './attachment.repository';
import { assertTaskActive } from '../task/task-archive.guard';
import type { AttachmentKey } from './attachment.schema';
import type { AttachmentRow } from './attachment.select';
import { deleteStoredObjects } from './attachment.storage';

const log = createLogger('tasks.attachment');

/** Сколько брошенных загрузок удаляется за один запрос слота. */
const STALE_PURGE_BATCH = 50;

function taskNotFound(workspaceId: string, taskId: string): NotFoundError {
  log.warn({ workspaceId, taskId }, '[attachment] task not found');
  return new NotFoundError('Задача не найдена');
}

function attachmentNotFound(context: Record<string, unknown>): NotFoundError {
  log.warn(context, '[attachment] not found');
  return new NotFoundError('Файл не найден');
}

/** Ошибка модели при проверке загрузки: логируем причину отказа и пробрасываем. */
function rejectOnError<T>(check: () => T, reason: string, context: Record<string, unknown>): T {
  try {
    return check();
  } catch (error) {
    log.warn({ ...context, reason }, '[attachment] rejected');
    throw error;
  }
}

/** Загружает вложение задачи, видимое пользователю (черновик чужого — как несуществующий). */
async function loadAttachment(key: AttachmentKey, access: WorkspaceAccess): Promise<AttachmentRow> {
  const valid = isEntityId(key.taskId) && isEntityId(key.attachmentId);
  const row = valid ? await attachmentRepository.find(key) : null;
  if (!row || !canViewAttachment(row, access)) {
    throw attachmentNotFound({ ...key, userId: access.userId });
  }
  return row;
}

/** Удаляет просроченные неподтверждённые загрузки и неотправленные черновики пользователя. */
async function purgeStaleUploads(userId: string): Promise<void> {
  const before = new Date(Date.now() - ATTACHMENT_STALE_AFTER_MS);
  const stale = await attachmentRepository.findStale(userId, before, STALE_PURGE_BATCH);
  if (stale.length === 0) return;

  const count = await attachmentRepository.deleteByIds(stale.map((row) => row.id));
  await deleteStoredObjects(
    stale.map((row) => row.storageKey),
    { userId, reason: 'stale' },
  );
  log.info({ userId, count }, '[attachment] stale uploads purged');
}

/** Готовые файлы блока «Вложения» задачи. */
export async function listTaskAttachments(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
): Promise<TaskAttachmentDto[]> {
  const access = await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) throw taskNotFound(workspaceId, taskId);

  const rows = await attachmentRepository.listForTask(workspaceId, taskId);
  log.debug(
    { userId: access.userId, workspaceId, taskId, count: rows.length },
    '[attachment.list]',
  );
  return rows.map((row) => toAttachmentDto(row, access));
}

/**
 * Слот загрузки: проверяет доступ, тип, размер и лимит, создаёт запись `pending` и выдаёт
 * presigned POST. Файл браузер отправляет прямо в хранилище.
 */
export async function requestUpload(
  session: AuthSession,
  input: {
    workspaceId: string;
    taskId: string;
    target: AttachmentTarget;
    fileName: string;
    size: number;
  },
): Promise<AttachmentUploadDto> {
  const { workspaceId, taskId, target, size } = input;
  const access = await requireWorkspaceAccess(session, workspaceId);
  await assertTaskActive(workspaceId, taskId);
  const exists = isEntityId(taskId) && (await attachmentRepository.taskExists(workspaceId, taskId));
  if (!exists) throw taskNotFound(workspaceId, taskId);

  await purgeStaleUploads(access.userId);

  const context = {
    workspaceId,
    taskId,
    userId: access.userId,
    target,
    size,
    extension: fileExtension(input.fileName),
  };
  const fileName = rejectOnError(() => sanitizeFileName(input.fileName), 'name', context);
  const type = rejectOnError(() => resolveAttachmentType(fileName), 'type', context);
  rejectOnError(() => assertAttachmentSize(size), 'size', context);
  const count = await attachmentRepository.countForTarget({
    workspaceId,
    taskId,
    target,
    uploaderId: access.userId,
  });
  rejectOnError(() => assertAttachmentLimit(count, target), 'limit', { ...context, count });

  const storageKey = attachmentStorageKey(workspaceId, taskId, randomUUID());
  const { id } = await attachmentRepository.createPending({
    workspaceId,
    taskId,
    target,
    uploaderId: access.userId,
    fileName,
    contentType: type.contentType,
    size,
    storageKey,
  });
  const post = await createUploadPost({
    key: storageKey,
    contentType: type.contentType,
    size,
    expiresIn: ATTACHMENT_UPLOAD_TTL_SECONDS,
  });
  log.info(
    { ...context, attachmentId: id, contentType: type.contentType },
    '[attachment] upload requested',
  );
  return { attachmentId: id, url: post.url, fields: post.fields };
}

/** Удаляет запись и объект загрузки, не прошедшей проверку, и сообщает пользователю. */
async function discardUpload(
  row: AttachmentRow,
  key: AttachmentKey,
  reason: string,
  message: string,
): Promise<never> {
  log.warn({ ...key, userId: row.uploaderId, reason }, '[attachment] rejected');
  await attachmentRepository.delete(key);
  await deleteStoredObjects([row.storageKey], { ...key, reason });
  throw new ValidationError(message);
}

/**
 * Подтверждение загрузки: файл есть в хранилище, размер совпадает, у картинки — верная
 * сигнатура. Подтверждает только загрузивший; повторное подтверждение — без изменений.
 */
export async function completeUpload(
  session: AuthSession,
  key: AttachmentKey,
): Promise<{ target: AttachmentTarget }> {
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  await assertTaskActive(key.workspaceId, key.taskId);
  const row = await loadAttachment(key, access);
  if (row.uploaderId !== access.userId) {
    throw attachmentNotFound({ ...key, userId: access.userId, reason: 'not-uploader' });
  }
  if (row.status === 'ready') {
    log.debug(key, '[attachment.complete] already uploaded');
    return { target: row.target };
  }

  const object = await headObject(row.storageKey);
  if (!object) {
    return discardUpload(row, key, 'missing-object', 'Файл не загрузился — попробуйте ещё раз');
  }
  if (object.size !== row.size) {
    return discardUpload(
      row,
      key,
      'size-mismatch',
      'Файл загрузился не полностью — попробуйте ещё раз',
    );
  }
  if (requiresSignatureCheck(row.contentType)) {
    const prefix = await readObjectPrefix(row.storageKey, ATTACHMENT_SIGNATURE_BYTES);
    if (!matchesImageSignature(row.contentType, prefix)) {
      return discardUpload(row, key, 'signature', 'Содержимое файла не соответствует его типу');
    }
  }

  const count = await attachmentRepository.markReady(key, new Date());
  if (count === 0) throw attachmentNotFound({ ...key, userId: access.userId });
  log.info(
    {
      ...key,
      userId: access.userId,
      target: row.target,
      size: row.size,
      contentType: row.contentType,
    },
    '[attachment] uploaded',
  );
  return { target: row.target };
}

/**
 * Удаление: загрузивший или владелец; черновик — только загрузивший. Последний файл комментария
 * без текста не удаляется. Сначала строка, потом объект: при сбое хранилища остаётся «сирота»,
 * а не битая ссылка.
 */
export async function deleteAttachment(
  session: AuthSession,
  key: AttachmentKey,
): Promise<{ target: AttachmentTarget }> {
  const access = await requireWorkspaceAccess(session, key.workspaceId);
  await assertTaskActive(key.workspaceId, key.taskId);
  const row = await loadAttachment(key, access);
  rejectOnError(() => assertCanDeleteAttachment(row, access), 'forbidden', {
    ...key,
    userId: access.userId,
    role: access.role,
  });

  if (row.commentId && row.status === 'ready') {
    const comment = await attachmentRepository.commentContent(
      key.workspaceId,
      key.taskId,
      row.commentId,
    );
    if (comment) {
      rejectOnError(
        () =>
          assertCanRemoveFromComment({
            bodyLength: comment.bodyLength,
            attachmentsLeft: comment.attachments - 1,
          }),
        'last-in-empty-comment',
        { ...key, commentId: row.commentId },
      );
    }
  }

  const count = await attachmentRepository.delete(key);
  if (count === 0) throw attachmentNotFound({ ...key, userId: access.userId });
  await deleteStoredObjects([row.storageKey], key);
  log.info(
    {
      ...key,
      userId: access.userId,
      target: row.target,
      byOwner: row.uploaderId !== access.userId,
    },
    '[attachment] deleted',
  );
  return { target: row.target };
}

/**
 * Короткоживущая ссылка на файл. `inline` — только для картинок с миниатюрой, остальное
 * отдаётся как `attachment`. Нет доступа или файла — `NotFoundError`.
 */
export async function getAttachmentDownload(
  session: AuthSession,
  attachmentId: string,
  options: { inline?: boolean } = {},
): Promise<{ url: string }> {
  const row = isEntityId(attachmentId) ? await attachmentRepository.findById(attachmentId) : null;
  if (!row || row.status !== 'ready') throw attachmentNotFound({ attachmentId });

  const access = await requireWorkspaceAccess(session, row.workspaceId);
  if (!canViewAttachment(row, access)) {
    throw attachmentNotFound({ attachmentId, userId: access.userId, reason: 'draft' });
  }

  const type = attachmentTypeOf(row.contentType);
  const inline = Boolean(options.inline) && type.previewable;
  const url = await createDownloadUrl({
    key: row.storageKey,
    contentType: row.contentType,
    contentDisposition: contentDisposition(row.fileName, inline ? 'inline' : 'attachment'),
    expiresIn: ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  });
  log.debug(
    { attachmentId, workspaceId: row.workspaceId, userId: access.userId, inline },
    '[attachment.download]',
  );
  return { url };
}
