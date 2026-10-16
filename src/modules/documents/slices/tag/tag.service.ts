import 'server-only';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  assertDocumentTagsLimit,
  assertWorkspaceTagsLimit,
  isDocumentEntityId,
  normalizeTagName,
  parseTagColor,
  tagNameKey,
  type DocumentTagColor,
} from '../../models';
import { loadDocument } from '../document/document.service';
import type { TagDto } from './tag.dto';
import { tagRepository } from './tag.repository';

const log = createLogger('documents.tag');

function nameTaken(): ConflictError {
  const message = 'Тег с таким названием уже есть';
  return new ConflictError(message, { fieldErrors: { name: [message] } });
}

function tagNotFound(context: Record<string, unknown>): NotFoundError {
  log.warn(context, '[tag] not found in workspace');
  return new NotFoundError('Тег не найден');
}

export async function listTags(session: AuthSession, workspaceId: string): Promise<TagDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await tagRepository.listByWorkspace(workspaceId);
  log.debug({ userId: session.user.id, workspaceId, count: rows.length }, '[tag.list]');
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: parseTagColor(row.color),
    documentsCount: row._count.assignments,
  }));
}

export async function createTag(
  session: AuthSession,
  input: { workspaceId: string; name: string; color: DocumentTagColor },
): Promise<TagDto> {
  const { workspaceId, color } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  const name = normalizeTagName(input.name);
  const nameKey = tagNameKey(name);

  const count = await tagRepository.countInWorkspace(workspaceId);
  try {
    assertWorkspaceTagsLimit(count);
  } catch (error) {
    log.warn({ workspaceId, count }, '[tag.create] limit reached');
    throw error;
  }
  if (await tagRepository.isNameTaken(workspaceId, nameKey)) {
    log.warn({ workspaceId }, '[tag.create] name taken');
    throw nameTaken();
  }
  try {
    const row = await tagRepository.create({ workspaceId, name, nameKey, color });
    log.info({ workspaceId, tagId: row.id, userId: session.user.id }, '[tag] created');
    return { id: row.id, name: row.name, color: parseTagColor(row.color), documentsCount: 0 };
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function updateTag(
  session: AuthSession,
  input: { workspaceId: string; tagId: string; name: string; color: DocumentTagColor },
): Promise<void> {
  const { workspaceId, tagId, color } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  if (!isDocumentEntityId(tagId) || !(await tagRepository.findInWorkspace(workspaceId, tagId))) {
    throw tagNotFound({ workspaceId, tagId });
  }
  const name = normalizeTagName(input.name);
  const nameKey = tagNameKey(name);
  if (await tagRepository.isNameTaken(workspaceId, nameKey, tagId)) {
    log.warn({ workspaceId, tagId }, '[tag.update] name taken');
    throw nameTaken();
  }
  try {
    const count = await tagRepository.update(workspaceId, tagId, { name, nameKey, color });
    if (count === 0) throw tagNotFound({ workspaceId, tagId });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  log.info({ workspaceId, tagId, userId: session.user.id }, '[tag] updated');
}

/** Удаление тега снимает его со всех документов (каскад связей). */
export async function deleteTag(
  session: AuthSession,
  input: { workspaceId: string; tagId: string },
): Promise<void> {
  const { workspaceId, tagId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  const count = isDocumentEntityId(tagId) ? await tagRepository.delete(workspaceId, tagId) : 0;
  if (count === 0) throw tagNotFound({ workspaceId, tagId });
  log.info({ workspaceId, tagId, userId: session.user.id }, '[tag] deleted');
}

/** Заменяет теги документа. Все теги — из того же пространства, иначе NOT_FOUND. */
export async function setDocumentTags(
  session: AuthSession,
  input: { workspaceId: string; documentId: string; tagIds: string[] },
): Promise<void> {
  const { workspaceId, documentId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  const tagIds = [...new Set(input.tagIds)];
  try {
    assertDocumentTagsLimit(tagIds.length);
  } catch (error) {
    log.warn({ workspaceId, documentId, count: tagIds.length }, '[tag.assign] limit');
    throw error;
  }
  await loadDocument(workspaceId, documentId);

  await prisma.$transaction(async (tx) => {
    if (tagIds.length > 0) {
      const found = await tagRepository.countInWorkspaceByIds(workspaceId, tagIds, tx);
      if (found !== tagIds.length) {
        throw tagNotFound({ workspaceId, documentId, requested: tagIds.length, found });
      }
    }
    await tagRepository.replaceDocumentTags(tx, workspaceId, documentId, tagIds);
  });
  log.info(
    { workspaceId, documentId, userId: session.user.id, count: tagIds.length },
    '[tag] assigned',
  );
}
