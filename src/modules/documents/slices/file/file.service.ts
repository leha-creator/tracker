import 'server-only';

import { randomUUID } from 'node:crypto';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { getStorageSettings } from '@/shared/resource-settings';
import {
  createDownloadUrl,
  createUploadPost,
  deleteObjects,
  headObject,
  readObjectPrefix,
  readObjectText,
} from '@/shared/storage';

import {
  assertDocumentFileSize,
  assertStorageQuota,
  contentDisposition,
  DOCUMENT_SIGNATURE_BYTES,
  DOCUMENT_STALE_AFTER_MS,
  DOCUMENT_TEXT_PREVIEW_MAX_BYTES,
  DOCUMENT_UPLOAD_TTL_SECONDS,
  documentFileTypeOf,
  documentStorageKey,
  documentTitleKey,
  downloadTtlSeconds,
  fileExtension,
  isDocumentEntityId,
  isInlineViewable,
  isTextViewer,
  matchesFileSignature,
  normalizeDocumentTitle,
  noteExportFileName,
  resolveDocumentFileType,
  resolveWorkspaceQuotaMb,
  sanitizeFileName,
  titleFromFileName,
} from '../../models';
import { documentNotFound } from '../document/document.service';
import { loadFolder } from '../folder/folder.service';
import type {
  DocumentFileResponse,
  DocumentTextDto,
  DocumentUploadDto,
  StorageUsageDto,
} from './file.dto';
import { fileRepository } from './file.repository';
import type { DocumentUploadKey } from './file.schema';

const log = createLogger('documents.file');

/** Сколько брошенных загрузок удаляется за один запрос слота. */
const STALE_PURGE_BATCH = 50;

type FileRow = NonNullable<Awaited<ReturnType<typeof fileRepository.findById>>>;

const MB = 1024 * 1024;

/** Квота пространства в байтах по приоритету: своя → по умолчанию ресурса → окружение. */
function quotaBytesOf(workspaceQuotaMb: number | null, defaultQuotaMb: number | null): number {
  return (
    resolveWorkspaceQuotaMb({
      workspaceQuotaMb,
      defaultQuotaMb,
      envQuotaMb: getEnv().DOCUMENTS_WORKSPACE_QUOTA_MB,
    }) * MB
  );
}

async function workspaceQuotaBytes(
  workspaceId: string,
  tx?: Parameters<typeof fileRepository.findQuotaMb>[1],
): Promise<number> {
  const [workspaceQuotaMb, settings] = await Promise.all([
    fileRepository.findQuotaMb(workspaceId, tx),
    getStorageSettings(),
  ]);
  return quotaBytesOf(workspaceQuotaMb, settings.defaultWorkspaceQuotaMb);
}

/** Ошибка модели при проверке загрузки: логируем причину отказа и пробрасываем. */
function rejectOnError<T>(check: () => T, reason: string, context: Record<string, unknown>): T {
  try {
    return check();
  } catch (error) {
    log.warn({ ...context, reason }, '[document.file] upload rejected');
    throw error;
  }
}

/** Удаляет объекты после удаления строк; не бросает — сбой хранилища виден в логах. */
async function deleteStoredObjects(keys: string[], context: Record<string, unknown>) {
  if (keys.length === 0) return;
  const failed = await deleteObjects(keys);
  if (failed > 0) {
    log.error({ ...context, count: keys.length, failed }, '[document.file] storage cleanup failed');
  }
}

async function purgeStaleUploads(userId: string): Promise<void> {
  const before = new Date(Date.now() - DOCUMENT_STALE_AFTER_MS);
  const stale = await fileRepository.findStale(userId, before, STALE_PURGE_BATCH);
  if (stale.length === 0) return;
  const count = await fileRepository.deleteByIds(stale.map((row) => row.id));
  await deleteStoredObjects(
    stale.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
    { userId, reason: 'stale' },
  );
  log.info({ userId, count }, '[document.file] stale uploads purged');
}

/** Файл пространства, загруженный этим пользователем (для подтверждения и отмены). */
async function loadOwnUpload(session: AuthSession, key: DocumentUploadKey): Promise<FileRow> {
  const row = isDocumentEntityId(key.documentId)
    ? await fileRepository.findInWorkspace(key.workspaceId, key.documentId)
    : null;
  if (!row || row.kind !== 'file' || row.createdById !== session.user.id) {
    log.warn({ ...key, userId: session.user.id }, '[document.file] upload not found');
    throw documentNotFound();
  }
  return row;
}

/**
 * Слот загрузки в хранилище пространства: право, папка, тип, размер и квота; создаёт документ
 * `pending` и выдаёт presigned POST. Квота проверяется под блокировкой пространства.
 */
export async function requestDocumentUpload(
  session: AuthSession,
  input: { workspaceId: string; folderId: string | null; fileName: string; size: number },
): Promise<DocumentUploadDto> {
  const { workspaceId, folderId, size } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  if (folderId) await loadFolder(workspaceId, folderId);
  await purgeStaleUploads(userId);

  const context = {
    workspaceId,
    folderId,
    userId,
    size,
    extension: fileExtension(input.fileName),
  };
  const fileName = rejectOnError(() => sanitizeFileName(input.fileName), 'name', context);
  const type = rejectOnError(() => resolveDocumentFileType(fileName), 'type', context);
  rejectOnError(() => assertDocumentFileSize(size), 'size', context);
  const title = rejectOnError(
    () => normalizeDocumentTitle(titleFromFileName(fileName)),
    'title',
    context,
  );

  const storageKey = documentStorageKey(workspaceId, randomUUID());
  const { id } = await prisma.$transaction(async (tx) => {
    await fileRepository.lockQuota(tx, workspaceId);
    const quotaBytes = await workspaceQuotaBytes(workspaceId, tx);
    const { usedBytes } = await fileRepository.usage(workspaceId, tx);
    try {
      assertStorageQuota({ usedBytes, incomingBytes: size, quotaBytes });
    } catch (error) {
      log.warn({ ...context, usedBytes, quotaBytes }, '[document.file] quota exceeded');
      throw error;
    }
    return fileRepository.createPending(tx, {
      workspaceId,
      folderId,
      title,
      titleKey: documentTitleKey(title),
      fileName,
      extension: type.extension,
      contentType: type.contentType,
      size,
      storageKey,
      userId,
      createdViaTokenId: session.via?.tokenId ?? null,
    });
  });

  const post = await createUploadPost({
    key: storageKey,
    contentType: type.contentType,
    size,
    expiresIn: DOCUMENT_UPLOAD_TTL_SECONDS,
  });
  log.info({ ...context, documentId: id }, '[document.file] upload requested');
  return { documentId: id, url: post.url, fields: post.fields };
}

async function discardUpload(row: FileRow, reason: string, message: string): Promise<never> {
  log.warn(
    { workspaceId: row.workspaceId, documentId: row.id, reason },
    `[document.file] ${reason}`,
  );
  await fileRepository.delete(row.workspaceId, row.id);
  await deleteStoredObjects(row.storageKey ? [row.storageKey] : [], {
    workspaceId: row.workspaceId,
    documentId: row.id,
    reason,
  });
  throw new ValidationError(message);
}

/**
 * Подтверждение загрузки: объект есть, размер совпадает, у картинок и PDF — верная сигнатура.
 * Подтверждает только загрузивший; повторное подтверждение — без изменений.
 */
export async function completeDocumentUpload(
  session: AuthSession,
  key: DocumentUploadKey,
): Promise<{ documentId: string }> {
  await requireWorkspacePermission(session, key.workspaceId, 'manageDocuments');
  const row = await loadOwnUpload(session, key);
  if (row.status === 'ready') {
    log.debug(key, '[document.file.complete] already uploaded');
    return { documentId: row.id };
  }
  if (!row.storageKey || !row.extension || !row.contentType || row.size === null) {
    return discardUpload(row, 'broken-row', 'Файл не загрузился — попробуйте ещё раз');
  }

  const object = await headObject(row.storageKey);
  if (!object) {
    return discardUpload(row, 'missing-object', 'Файл не загрузился — попробуйте ещё раз');
  }
  if (object.size !== row.size) {
    return discardUpload(row, 'size mismatch', 'Файл загрузился не полностью — попробуйте ещё раз');
  }
  const type = documentFileTypeOf(row.extension, row.contentType);
  if (type.signature) {
    const prefix = await readObjectPrefix(row.storageKey, DOCUMENT_SIGNATURE_BYTES);
    if (!matchesFileSignature(type, prefix)) {
      return discardUpload(row, 'signature mismatch', 'Содержимое файла не соответствует его типу');
    }
  }

  const count = await fileRepository.markReady(key.workspaceId, row.id, new Date());
  if (count === 0) throw documentNotFound();
  log.info(
    {
      ...key,
      userId: session.user.id,
      extension: row.extension,
      size: row.size,
    },
    '[document.file] upload completed',
  );
  await recordAuditEvent({
    kind: 'document.created',
    actor: auditActorFromSession(session),
    workspaceId: key.workspaceId,
    data: { documentId: row.id, title: row.title, kind: 'file' },
  });
  return { documentId: row.id };
}

/** Отмена незавершённой загрузки: строка и объект (если успел загрузиться). */
export async function cancelDocumentUpload(
  session: AuthSession,
  key: DocumentUploadKey,
): Promise<void> {
  await requireWorkspacePermission(session, key.workspaceId, 'manageDocuments');
  const row = await loadOwnUpload(session, key);
  if (row.status !== 'pending') {
    log.debug(key, '[document.file.cancel] already completed, skip');
    return;
  }
  await fileRepository.delete(key.workspaceId, row.id);
  await deleteStoredObjects(row.storageKey ? [row.storageKey] : [], { ...key, reason: 'canceled' });
  log.info({ ...key, userId: session.user.id }, '[document.file] upload canceled');
}

/**
 * Файл документа для `GET /api/documents/[id]/file`: короткоживущая ссылка на хранилище
 * (`inline` — только для просматриваемых типов) или Markdown заметки. Нет доступа — NOT_FOUND.
 */
export async function getDocumentFile(
  session: AuthSession,
  documentId: string,
  options: { inline?: boolean } = {},
): Promise<DocumentFileResponse> {
  const row = isDocumentEntityId(documentId) ? await fileRepository.findById(documentId) : null;
  const visible = row && (row.kind === 'note' || row.status === 'ready');
  if (!row || !visible) {
    log.warn({ documentId, userId: session.user.id }, '[document.file] download not found');
    throw documentNotFound();
  }
  // Неучастнику requireWorkspaceAccess отвечает NOT_FOUND — существование не раскрывается.
  await requireWorkspaceAccess(session, row.workspaceId);

  if (row.kind === 'note') {
    log.debug({ documentId, userId: session.user.id }, '[document.file] note export');
    return {
      kind: 'note',
      content: row.content ?? '',
      contentDisposition: contentDisposition(noteExportFileName(row.title), 'attachment'),
    };
  }
  if (!row.storageKey || !row.extension || !row.contentType || !row.fileName) {
    throw documentNotFound();
  }

  const type = documentFileTypeOf(row.extension, row.contentType);
  const inline = Boolean(options.inline) && isInlineViewable(type);
  const ttl = downloadTtlSeconds(type, inline);
  const url = await createDownloadUrl({
    key: row.storageKey,
    contentType: row.contentType,
    contentDisposition: contentDisposition(row.fileName, inline ? 'inline' : 'attachment'),
    expiresIn: ttl,
  });
  log.debug(
    { documentId, workspaceId: row.workspaceId, userId: session.user.id, inline, ttl },
    '[document.file] download link',
  );
  return { kind: 'redirect', url };
}

/** Начало текстового файла для просмотра (Markdown, CSV, JSON, код) — до 1 МБ. */
export async function getDocumentText(
  session: AuthSession,
  workspaceId: string,
  documentId: string,
): Promise<DocumentTextDto> {
  await requireWorkspaceAccess(session, workspaceId);
  const row = isDocumentEntityId(documentId)
    ? await fileRepository.findInWorkspace(workspaceId, documentId)
    : null;
  if (!row || row.kind !== 'file' || row.status !== 'ready' || !row.storageKey) {
    throw documentNotFound();
  }
  const type = documentFileTypeOf(row.extension ?? '', row.contentType ?? '');
  if (!isTextViewer(type.viewer)) {
    log.warn({ workspaceId, documentId, viewer: type.viewer }, '[document.file] not a text file');
    throw new ValidationError('Этот файл нельзя показать как текст');
  }
  const result = await readObjectText(row.storageKey, DOCUMENT_TEXT_PREVIEW_MAX_BYTES);
  log.debug(
    { workspaceId, documentId, viewer: type.viewer, truncated: result.truncated },
    '[document.file] text read',
  );
  return result;
}

export async function getWorkspaceStorageUsage(
  session: AuthSession,
  workspaceId: string,
): Promise<StorageUsageDto> {
  await requireWorkspaceAccess(session, workspaceId);
  const [usage, quotaBytes] = await Promise.all([
    fileRepository.usage(workspaceId),
    workspaceQuotaBytes(workspaceId),
  ]);
  log.debug({ workspaceId, ...usage, quotaBytes }, '[document.file] storage usage');
  return { ...usage, quotaBytes };
}

/**
 * Файлы документов всего ресурса. Без проверки сессии: только для модуля admin, уже вызвавшего
 * requireAdmin().
 */
export async function getTotalDocumentStorageUsage(): Promise<{
  usedBytes: number;
  filesCount: number;
}> {
  return fileRepository.totalUsage();
}

/**
 * Хранилище нескольких пространств: занято и действующая квота. Без проверки сессии: только для
 * модуля admin, уже вызвавшего requireAdmin(). Пространство без файлов — нули.
 */
export async function getStorageUsageByWorkspaces(
  workspaceIds: readonly string[],
): Promise<Map<string, StorageUsageDto>> {
  if (workspaceIds.length === 0) return new Map();
  const [usage, quotas, settings] = await Promise.all([
    fileRepository.usageByWorkspaces(workspaceIds),
    fileRepository.quotasByWorkspaces(workspaceIds),
    getStorageSettings(),
  ]);
  log.debug({ count: workspaceIds.length }, '[document.file] storage usage by workspaces');
  return new Map(
    workspaceIds.map((id) => [
      id,
      {
        ...(usage.get(id) ?? { usedBytes: 0, filesCount: 0 }),
        quotaBytes: quotaBytesOf(quotas.get(id) ?? null, settings.defaultWorkspaceQuotaMb),
      },
    ]),
  );
}
