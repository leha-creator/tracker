import 'server-only';

import { cache } from 'react';

import { requireWorkspaceAccess, requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { isUniqueViolation, prisma, type TransactionClient } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';
import { deleteObjects } from '@/shared/storage';

import {
  assertCanCreateFolderIn,
  assertCanMoveFolder,
  folderNameKey,
  folderPath,
  formatFolderPath,
  isDocumentEntityId,
  normalizeFolderName,
} from '../../models';
import type { DocumentFolderDto, FolderDeletedDto } from './folder.dto';
import { folderRepository } from './folder.repository';

const log = createLogger('documents.folder');

type FolderRow = NonNullable<Awaited<ReturnType<typeof folderRepository.findInWorkspace>>>;

function nameTaken(): ConflictError {
  const message = 'Папка с таким названием здесь уже есть';
  return new ConflictError(message, { fieldErrors: { name: [message] } });
}

export function folderNotFound(): NotFoundError {
  return new NotFoundError('Папка не найдена');
}

/**
 * Папка пространства или NOT_FOUND (в том числе для id не в формате UUID). Для других срезов
 * модуля, которые уже проверили доступ к пространству.
 */
export async function loadFolder(
  workspaceId: string,
  folderId: string,
  tx?: TransactionClient,
): Promise<FolderRow> {
  const row = isDocumentEntityId(folderId)
    ? await folderRepository.findInWorkspace(workspaceId, folderId, tx)
    : null;
  if (!row) {
    log.warn({ workspaceId, folderId }, '[folder] not found in workspace');
    throw folderNotFound();
  }
  return row;
}

/**
 * Перестройки дерева в пространстве идут по очереди: два параллельных перемещения не создадут
 * цикл, который каждое по отдельности не создаёт.
 */
async function lockTree(tx: TransactionClient, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents-tree:${workspaceId}`}))`;
}

// Дерево читают и layout раздела, и страница — один запрос на рендер.
const loadTree = cache((workspaceId: string) => folderRepository.listByWorkspace(workspaceId));

export async function listFolderTree(
  session: AuthSession,
  workspaceId: string,
): Promise<DocumentFolderDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const rows = await loadTree(workspaceId);
  log.debug(
    { userId: session.user.id, workspaceId, count: rows.length },
    '[folder.listFolderTree]',
  );
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    documentsCount: row._count.documents,
  }));
}

/**
 * Путь каждой папки пространства строкой («Проект / Спецификации») — для документов в
 * поиске и в задаче. Без проверки доступа: для срезов модуля, которые уже её сделали.
 */
export async function getFolderPaths(workspaceId: string): Promise<Map<string, string>> {
  const rows = await loadTree(workspaceId);
  return new Map(rows.map((row) => [row.id, formatFolderPath(folderPath(rows, row.id))]));
}

export async function createFolder(
  session: AuthSession,
  input: { workspaceId: string; parentId: string | null; name: string },
): Promise<DocumentFolderDto> {
  const { workspaceId, parentId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, parentId }, '[folder.createFolder] start');

  const name = normalizeFolderName(input.name);
  const nameKey = folderNameKey(name);
  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockTree(tx, workspaceId);
      if (parentId) {
        await loadFolder(workspaceId, parentId, tx);
        const depth = (await folderRepository.pathIds(workspaceId, parentId, tx)).length;
        try {
          assertCanCreateFolderIn(depth);
        } catch (error) {
          log.warn({ workspaceId, parentId, depth }, '[folder.createFolder] too deep');
          throw error;
        }
      }
      if (await folderRepository.isNameTaken(workspaceId, parentId, nameKey, undefined, tx)) {
        throw nameTaken();
      }
      return folderRepository.create(tx, {
        workspaceId,
        parentId,
        name,
        nameKey,
        createdById: userId,
      });
    });
    log.info({ workspaceId, folderId: row.id, parentId, userId }, '[folder] created');
    return { id: row.id, parentId: row.parentId, name: row.name, documentsCount: 0 };
  } catch (error) {
    if (error instanceof ConflictError || isUniqueViolation(error)) {
      log.warn({ workspaceId, parentId, userId }, '[folder.createFolder] name taken');
      throw nameTaken();
    }
    throw error;
  }
}

export async function renameFolder(
  session: AuthSession,
  input: { workspaceId: string; folderId: string; name: string },
): Promise<void> {
  const { workspaceId, folderId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId: session.user.id, workspaceId, folderId }, '[folder.renameFolder] start');

  const folder = await loadFolder(workspaceId, folderId);
  const name = normalizeFolderName(input.name);
  const nameKey = folderNameKey(name);
  if (await folderRepository.isNameTaken(workspaceId, folder.parentId, nameKey, folderId)) {
    log.warn({ workspaceId, folderId }, '[folder.renameFolder] name taken');
    throw nameTaken();
  }
  try {
    const count = await folderRepository.update(workspaceId, folderId, { name, nameKey });
    if (count === 0) throw folderNotFound();
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
  log.info({ workspaceId, folderId, userId: session.user.id }, '[folder] renamed');
}

export async function moveFolder(
  session: AuthSession,
  input: { workspaceId: string; folderId: string; targetId: string | null },
): Promise<void> {
  const { workspaceId, folderId, targetId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, folderId, targetId }, '[folder.moveFolder] start');

  try {
    await prisma.$transaction(async (tx) => {
      await lockTree(tx, workspaceId);
      const folder = await loadFolder(workspaceId, folderId, tx);
      if (folder.parentId === targetId) {
        log.debug({ workspaceId, folderId }, '[folder.moveFolder] same parent, skip');
        return;
      }

      let targetPathIds: string[] = [];
      if (targetId) {
        await loadFolder(workspaceId, targetId, tx);
        targetPathIds = await folderRepository.pathIds(workspaceId, targetId, tx);
      }
      const subtreeHeight = await folderRepository.subtreeHeight(workspaceId, folderId, tx);
      try {
        assertCanMoveFolder({ folderId, targetId, targetPathIds, subtreeHeight });
      } catch (error) {
        log.warn(
          { workspaceId, folderId, targetId, targetDepth: targetPathIds.length, subtreeHeight },
          '[folder.moveFolder] rejected',
        );
        throw error;
      }

      const nameKey = folderNameKey(folder.name);
      if (await folderRepository.isNameTaken(workspaceId, targetId, nameKey, folderId, tx)) {
        throw nameTaken();
      }
      await folderRepository.update(workspaceId, folderId, { parentId: targetId }, tx);
    });
  } catch (error) {
    if (error instanceof ConflictError || isUniqueViolation(error)) {
      log.warn({ workspaceId, folderId, targetId }, '[folder.moveFolder] name taken in target');
      throw new ConflictError('В папке назначения уже есть папка с таким названием');
    }
    throw error;
  }
  log.info({ workspaceId, folderId, parentId: targetId, userId }, '[folder] moved');
}

/**
 * Удаляет папку со всеми подпапками и документами. Строки удаляются каскадом в транзакции,
 * объекты хранилища — после неё: сбой хранилища не возвращает удалённые строки (ERROR в логе).
 */
export async function deleteFolder(
  session: AuthSession,
  input: { workspaceId: string; folderId: string },
): Promise<FolderDeletedDto> {
  const { workspaceId, folderId } = input;
  const userId = session.user.id;
  await requireWorkspacePermission(session, workspaceId, 'manageDocuments');
  log.debug({ userId, workspaceId, folderId }, '[folder.deleteFolder] start');

  const contents = await prisma.$transaction(async (tx) => {
    await lockTree(tx, workspaceId);
    await loadFolder(workspaceId, folderId, tx);
    const result = await folderRepository.subtreeContents(tx, workspaceId, folderId);
    const count = await folderRepository.delete(tx, workspaceId, folderId);
    if (count === 0) throw folderNotFound();
    return result;
  });

  const objectsFailed =
    contents.storageKeys.length > 0 ? await deleteObjects(contents.storageKeys) : 0;
  if (objectsFailed > 0) {
    log.error(
      { workspaceId, folderId, objectsFailed },
      '[folder.deleteFolder] objects not deleted',
    );
  }
  log.info(
    {
      workspaceId,
      folderId,
      userId,
      documentsDeleted: contents.documentsCount,
      objectsDeleted: contents.storageKeys.length - objectsFailed,
      objectsFailed,
    },
    '[folder] deleted',
  );
  return { documentsDeleted: contents.documentsCount };
}
