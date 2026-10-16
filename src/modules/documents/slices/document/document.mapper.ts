import {
  documentFileTypeOf,
  isInlineViewable,
  parseTagColor,
  type DocumentFileType,
} from '../../models';
import type {
  DocumentDto,
  DocumentSummaryDto,
  DocumentTagDto,
  DocumentUserDto,
} from './document.dto';
import type { DocumentRow, DocumentSummaryRow } from './document.select';

type UserRow = { id: string; name: string; image: string | null } | null;

function toUserDto(user: UserRow): DocumentUserDto | null {
  return user ? { userId: user.id, name: user.name, image: user.image } : null;
}

/** Теги по имени без учёта регистра — стабильный порядок во всех списках. */
export function toTagDtos(rows: DocumentSummaryRow['tags']): DocumentTagDto[] {
  return rows
    .map(({ tag }) => tag)
    .sort((a, b) => a.nameKey.localeCompare(b.nameKey, 'ru'))
    .map((tag) => ({ id: tag.id, name: tag.name, color: parseTagColor(tag.color) }));
}

/** Тип файла строки; у заметки — null. */
export function fileTypeOf(row: Pick<DocumentSummaryRow, 'kind' | 'extension' | 'contentType'>) {
  return row.kind === 'file' && row.extension
    ? documentFileTypeOf(row.extension, row.contentType ?? 'application/octet-stream')
    : null;
}

export function toDocumentSummaryDto(row: DocumentSummaryRow): DocumentSummaryDto {
  const type: DocumentFileType | null = fileTypeOf(row);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    folderId: row.folderId,
    extension: row.extension,
    fileKind: type?.kind ?? null,
    viewer: type?.viewer ?? null,
    size: row.size,
    tags: toTagDtos(row.tags),
    createdBy: toUserDto(row.createdBy),
    updatedBy: toUserDto(row.updatedBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDocumentDto(row: DocumentRow): DocumentDto {
  const type = fileTypeOf(row);
  return {
    ...toDocumentSummaryDto(row),
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspace.slug,
    version: row.version,
    content: row.kind === 'note' ? (row.content ?? '') : null,
    fileName: row.fileName,
    inlineViewable: type ? isInlineViewable(type) : false,
  };
}
