import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import { auditActorFromSession, recordAuditEvent } from '@/shared/audit';
import type { AuthSession } from '@/shared/auth';
import type { TransactionClient } from '@/shared/db';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { deleteObjects } from '@/shared/storage';

import {
  assertNoteVersion,
  documentTitleKey,
  isDocumentEntityId,
  normalizeDocumentTitle,
  normalizeNoteContent,
  sanitizeFileName,
} from '../../models';
import { loadFolder } from '../folder/folder.service';
import type { DocumentDto, NoteSavedDto } from './document.dto';
import { toDocumentDto } from './document.mapper';
import { documentRepository } from './document.repository';
import type { DocumentRow } from './document.select';

const log = createLogger('documents.document');

export function documentNotFound(): NotFoundError {
  return new NotFoundError('Документ не найден');
}

/**
 * Заметка или подтверждённый файл пространства, иначе NOT_FOUND (в том числе для id не в
 * формате UUID). Для других срезов модуля, которые уже проверили доступ к пространству.
 */
export async function loadDocument(
  workspaceId: string,
  documentId: string,
  tx?: TransactionClient,
): Promise<DocumentRow> {
  const row = isDocumentEntityId(documentId)
    ? await documentRepository.findVisible(workspaceId, documentId, tx)
    : null;
  if (!row) {
    log.warn({ workspaceId, documentId }, '[document] not found in workspace');
    throw documentNotFound();
  }
  return row;
}

function versionConflict(details: Record<string, unknown>): ConflictError {
  return new ConflictError('Документ изменили, пока вы его редактировали', { details });
}

export async function getDocument(
  session: AuthSession,
  workspaceId: string,
  documentId: string,
): Promise<DocumentDto> {
  await requireWorkspaceAccess(session, workspaceId);
  const row = await loadDocument(workspaceId, documentId);
  log.debug({ userId: session.user.id, workspaceId, documentId, kind: row.kind }, '[document.get]');
  return toDocumentDto(row);
}

export async function createNote(
  session: AuthSession,
  input: { workspaceId: string; folderId: string | null; title: string; content: string },
): Promise<DocumentDto> {
  const { workspaceId, folderId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, folderId }, '[document.createNote] start');

  const title = normalizeDocumentTitle(input.title);
  const content = normalizeNoteContent(input.content);
  if (folderId) await loadFolder(workspaceId, folderId);

  const row = await documentRepository.createNote({
    workspaceId,
    folderId,
    title,
    titleKey: documentTitleKey(title),
    content,
    userId,
    createdViaTokenId: session.via?.tokenId ?? null,
  });
  // Текст заметки не логируем — только длину.
  log.info(
    {
      workspaceId,
      documentId: row.id,
      folderId,
      userId,
      length: content.length,
      via: session.via?.tokenId ?? null,
    },
    '[document] note created',
  );
  await recordAuditEvent({
    kind: 'document.created',
    actor: auditActorFromSession(session),
    workspaceId,
    data: { documentId: row.id, title: row.title, kind: 'note' },
  });
  return toDocumentDto(row);
}

export async function updateNote(
  session: AuthSession,
  input: {
    workspaceId: string;
    documentId: string;
    title: string;
    content: string;
    version: number;
  },
): Promise<NoteSavedDto> {
  const { workspaceId, documentId, version } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, documentId, version }, '[document.updateNote] start');

  const row = await loadDocument(workspaceId, documentId);
  if (row.kind !== 'note') {
    log.warn({ workspaceId, documentId }, '[document.updateNote] not a note');
    throw new ValidationError('Редактировать можно только заметку');
  }
  try {
    assertNoteVersion(version, row.version);
  } catch (error) {
    log.warn(
      { workspaceId, documentId, expected: version, actual: row.version },
      '[document] version conflict',
    );
    throw error;
  }

  const title = normalizeDocumentTitle(input.title);
  const content = normalizeNoteContent(input.content);
  const count = await documentRepository.updateNote(workspaceId, documentId, version, {
    title,
    titleKey: documentTitleKey(title),
    content,
    userId,
  });
  if (count === 0) {
    // Версия сменилась между чтением и записью — параллельное сохранение.
    log.warn({ workspaceId, documentId, expected: version }, '[document] version conflict (race)');
    throw versionConflict({ expected: version });
  }

  const saved = await documentRepository.findVersion(workspaceId, documentId);
  if (!saved) throw documentNotFound();
  log.info(
    { workspaceId, documentId, userId, version: saved.version, length: content.length },
    '[document] note updated',
  );
  return { version: saved.version, updatedAt: saved.updatedAt };
}

/** Переименование. У файла меняется и имя для скачивания (расширение сохраняется). */
export async function renameDocument(
  session: AuthSession,
  input: { workspaceId: string; documentId: string; title: string },
): Promise<void> {
  const { workspaceId, documentId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, documentId }, '[document.rename] start');

  const row = await loadDocument(workspaceId, documentId);
  const title = normalizeDocumentTitle(input.title);
  const fileName =
    row.kind === 'file' && row.extension
      ? sanitizeFileName(`${title}.${row.extension}`)
      : undefined;
  const count = await documentRepository.update(workspaceId, documentId, {
    title,
    titleKey: documentTitleKey(title),
    fileName,
    updatedById: userId,
  });
  if (count === 0) throw documentNotFound();
  log.info({ workspaceId, documentId, userId, kind: row.kind }, '[document] renamed');
}

export async function moveDocument(
  session: AuthSession,
  input: { workspaceId: string; documentId: string; folderId: string | null },
): Promise<void> {
  const { workspaceId, documentId, folderId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, documentId, folderId }, '[document.move] start');

  const row = await loadDocument(workspaceId, documentId);
  if (row.folderId === folderId) {
    log.debug({ workspaceId, documentId }, '[document.move] same folder, skip');
    return;
  }
  if (folderId) await loadFolder(workspaceId, folderId);
  const count = await documentRepository.update(workspaceId, documentId, {
    folderId,
    updatedById: userId,
  });
  if (count === 0) throw documentNotFound();
  log.info(
    { workspaceId, documentId, userId, fromFolderId: row.folderId, folderId },
    '[document] moved',
  );
}

/** Удаляет документ; объект файла — после строки (сбой хранилища — ERROR, строка уже удалена). */
export async function deleteDocument(
  session: AuthSession,
  input: { workspaceId: string; documentId: string },
): Promise<{ folderId: string | null }> {
  const { workspaceId, documentId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, documentId }, '[document.delete] start');

  const row = await loadDocument(workspaceId, documentId);
  const count = await documentRepository.delete(workspaceId, documentId);
  if (count === 0) throw documentNotFound();

  let objectsFailed = 0;
  if (row.storageKey) {
    objectsFailed = await deleteObjects([row.storageKey]);
    if (objectsFailed > 0) {
      log.error({ workspaceId, documentId }, '[document.delete] object not deleted');
    }
  }
  log.info(
    { workspaceId, documentId, userId, kind: row.kind, objectsFailed },
    '[document] deleted',
  );
  await recordAuditEvent({
    kind: 'document.deleted',
    actor: auditActorFromSession(session),
    workspaceId,
    data: { documentId, title: row.title, kind: row.kind },
  });
  return { folderId: row.folderId };
}
