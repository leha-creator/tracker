import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import {
  DOCUMENT_LIST_PAGE_SIZE,
  documentPageCount,
  folderPath,
  isDocumentSearch,
  type DocumentListQuery,
} from '../../models';
import { toDocumentSummaryDto } from '../document/document.mapper';
import type { DocumentSummaryRow } from '../document/document.select';
import { getWorkspaceStorageUsage } from '../file/file.service';
import { folderNotFound, getFolderPaths, listFolderTree } from '../folder/folder.service';
import type { LinkedDocumentDto } from '../task-link/task-link.dto';
import type { DocumentListPageDto, DocumentsOverviewDto } from './views.dto';
import { buildDocumentOrderBy, buildDocumentWhere } from './documents-list.prisma';
import { viewsRepository } from './views.repository';

const log = createLogger('documents.views');

/** Сколько недавних документов показывает обзор. */
const RECENT_LIMIT = 5;

async function withPaths(workspaceId: string, rows: DocumentSummaryRow[]) {
  const paths = rows.length > 0 ? await getFolderPaths(workspaceId) : new Map<string, string>();
  return rows.map((row) => ({
    ...toDocumentSummaryDto(row),
    folderPath: row.folderId ? (paths.get(row.folderId) ?? '') : '',
  }));
}

/**
 * Обзор папки или поиск по пространству. Несуществующая папка — NOT_FOUND. Запрошенная страница
 * за пределами — последняя.
 */
export async function listDocuments(
  session: AuthSession,
  workspaceId: string,
  query: DocumentListQuery,
): Promise<DocumentListPageDto> {
  const startedAt = Date.now();
  const tree = await listFolderTree(session, workspaceId);
  const path = query.folder ? folderPath(tree, query.folder) : [];
  if (query.folder && path.length === 0) {
    log.warn({ workspaceId, folderId: query.folder }, '[views.listDocuments] folder not found');
    throw folderNotFound();
  }

  const isSearch = isDocumentSearch(query);
  const where = buildDocumentWhere(query, workspaceId);
  const orderBy = buildDocumentOrderBy(query.sort, query.dir);
  const pageSize = DOCUMENT_LIST_PAGE_SIZE;

  let page = query.page;
  let result = await viewsRepository.listDocumentPage({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const pageCount = documentPageCount(result.total, pageSize);
  if (page > pageCount) {
    page = pageCount;
    result = await viewsRepository.listDocumentPage({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  const folders =
    isSearch || page > 1
      ? []
      : tree
          .filter((folder) => folder.parentId === query.folder)
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const dto: DocumentListPageDto = {
    path: path.map((folder) => ({ id: folder.id, name: folder.name })),
    folders,
    documents: await withPaths(workspaceId, result.rows),
    isSearch,
    total: result.total,
    page,
    pageCount,
    pageSize,
  };
  // Строку поиска не логируем — только её длину.
  log.debug(
    {
      workspaceId,
      userId: session.user.id,
      folderId: query.folder,
      queryLength: query.q.length,
      tag: query.tag,
      kind: query.kind,
      sort: query.sort,
      page,
      requestedPage: query.page,
      total: result.total,
      folders: folders.length,
      durationMs: Date.now() - startedAt,
    },
    '[views.listDocuments]',
  );
  return dto;
}

export async function getDocumentsOverview(
  session: AuthSession,
  workspaceId: string,
): Promise<DocumentsOverviewDto> {
  await requireWorkspaceAccess(session, workspaceId);
  const [usage, rows] = await Promise.all([
    getWorkspaceStorageUsage(session, workspaceId),
    viewsRepository.listRecent(workspaceId, RECENT_LIMIT),
  ]);
  log.debug({ workspaceId, userId: session.user.id, recent: rows.length }, '[views.overview]');
  return { usage, recent: await withPaths(workspaceId, rows) };
}

/**
 * Поиск документов пространства по части названия — для палитры Cmd+K. Только видимые документы
 * (заметки и загруженные файлы), недавно изменённые выше.
 */
export async function searchDocuments(
  session: AuthSession,
  workspaceId: string,
  q: string,
  limit: number,
): Promise<LinkedDocumentDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  const text = q.trim().toLocaleLowerCase('ru');
  if (!text || limit <= 0) return [];
  const rows = await viewsRepository.searchByTitle(workspaceId, text, limit);
  // Текст запроса не логируем — только его длину.
  log.debug(
    { workspaceId, userId: session.user.id, qLength: text.length, found: rows.length },
    '[views.searchDocuments]',
  );
  return withPaths(workspaceId, rows);
}
