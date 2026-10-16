import type { Prisma } from '@/generated/prisma/client';

import {
  documentKindCondition,
  isDocumentSearch,
  type DocumentListQuery,
  type DocumentListSort,
  type DocumentSortDirection,
} from '../../models';
import { VISIBLE_DOCUMENT_WHERE } from '../document/document.select';

/**
 * Условие списка документов. Всегда с workspaceId. Обзор папки — только её документы; поиск
 * (название, тег, вид) — по всему пространству.
 */
export function buildDocumentWhere(
  query: DocumentListQuery,
  workspaceId: string,
): Prisma.DocumentWhereInput {
  const and: Prisma.DocumentWhereInput[] = [VISIBLE_DOCUMENT_WHERE];

  if (!isDocumentSearch(query)) and.push({ folderId: query.folder });
  if (query.q) and.push({ titleKey: { contains: query.q.toLocaleLowerCase('ru') } });
  if (query.tag) and.push({ tags: { some: { tagId: query.tag } } });
  if (query.kind) {
    const condition = documentKindCondition(query.kind);
    and.push(
      condition.kind === 'note'
        ? { kind: 'note' }
        : {
            kind: 'file',
            extension: condition.exclude
              ? { notIn: condition.extensions }
              : { in: condition.extensions },
          },
    );
  }
  return { workspaceId, AND: and };
}

const SORT_FIELDS: Record<DocumentListSort, 'titleKey' | 'updatedAt' | 'createdAt'> = {
  name: 'titleKey',
  updated: 'updatedAt',
  created: 'createdAt',
};

/** Сортировка с id для стабильного порядка страниц. */
export function buildDocumentOrderBy(
  sort: DocumentListSort,
  dir: DocumentSortDirection,
): Prisma.DocumentOrderByWithRelationInput[] {
  return [{ [SORT_FIELDS[sort]]: dir }, { id: dir }];
}
