import {
  defaultDocumentListQuery,
  patchDocumentListQuery,
  serializeDocumentListParams,
  type DocumentListQuery,
} from '@/modules/documents/client';

/** Обзор документов: корень, папка или поиск (состояние — в query string). */
export function docsHref(workspaceSlug: string, query?: Partial<DocumentListQuery>): string {
  const base = `/w/${workspaceSlug}/docs`;
  if (!query) return base;
  const search = serializeDocumentListParams(
    patchDocumentListQuery(defaultDocumentListQuery(), query),
  );
  return search ? `${base}?${search}` : base;
}

/** Папка в обзоре; null — корень пространства. */
export function folderHref(workspaceSlug: string, folderId: string | null): string {
  return docsHref(workspaceSlug, { folder: folderId });
}

export function documentHref(workspaceSlug: string, documentId: string): string {
  return `/w/${workspaceSlug}/docs/${documentId}`;
}

export function documentEditHref(workspaceSlug: string, documentId: string): string {
  return `${documentHref(workspaceSlug, documentId)}/edit`;
}

/** Новая заметка в папке; `linkTask` — сразу привязать к задаче после создания. */
export function newNoteHref(
  workspaceSlug: string,
  options: { folderId?: string | null; linkTaskId?: string } = {},
): string {
  const params = new URLSearchParams();
  if (options.folderId) params.set('folder', options.folderId);
  if (options.linkTaskId) params.set('linkTask', options.linkTaskId);
  const search = params.toString();
  return `/w/${workspaceSlug}/docs/new${search ? `?${search}` : ''}`;
}

/** Ссылка на файл документа через проверку доступа (`inline` — открыть в браузере). */
export function documentFileHref(documentId: string, options: { inline?: boolean } = {}): string {
  return `/api/documents/${documentId}/file${options.inline ? '?inline=1' : ''}`;
}
