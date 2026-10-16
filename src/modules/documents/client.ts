/**
 * Публичный API модуля для клиентских компонентов: Server Actions, константы, чистые функции и
 * типы. Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  applyMarkdownFormat,
  clearDocumentFilters,
  defaultDocumentListQuery,
  CSV_PREVIEW_MAX_ROWS,
  DOCUMENT_ACCEPT,
  DOCUMENT_FILE_MAX_SIZE,
  DOCUMENT_KIND_FILTER_LABELS,
  DOCUMENT_KIND_FILTERS,
  DOCUMENT_LIST_QUERY_MAX_LENGTH,
  DOCUMENT_LIST_SORT_LABELS,
  DOCUMENT_LIST_SORTS,
  DOCUMENT_TAG_COLORS,
  DOCUMENT_TAGS_LIMIT,
  DOCUMENT_TEXT_PREVIEW_MAX_BYTES,
  DOCUMENT_TITLE_MAX_LENGTH,
  detectCsvDelimiter,
  FOLDER_MAX_DEPTH,
  FOLDER_NAME_MAX_LENGTH,
  findDocumentFileType,
  folderPath,
  formatBytes,
  formatFolderPath,
  insertMarkdownLink,
  isDocumentSearch,
  NOTE_CONTENT_MAX_LENGTH,
  parseDelimited,
  patchDocumentListQuery,
  serializeDocumentListParams,
  TAG_NAME_MAX_LENGTH,
  TASK_DOCUMENT_LINKS_LIMIT,
} from './models';
export type {
  DelimitedTable,
  DocumentFileKind,
  DocumentKindFilter,
  DocumentListQuery,
  DocumentListSort,
  DocumentSortDirection,
  DocumentTagColor,
  DocumentTextViewer,
  DocumentViewer,
  FormatResult,
  MarkdownAction,
  TextSelection,
} from './models';

export {
  createNoteAction,
  deleteDocumentAction,
  moveDocumentAction,
  renameDocumentAction,
  updateNoteAction,
} from './slices/document/document.actions';
export type {
  DocumentDto,
  DocumentKind,
  DocumentSummaryDto,
  DocumentTagDto,
  DocumentUserDto,
  NoteSavedDto,
} from './slices/document/document.dto';
export {
  cancelDocumentUploadAction,
  completeDocumentUploadAction,
  requestDocumentUploadAction,
} from './slices/file/file.actions';
export type { DocumentTextDto, DocumentUploadDto, StorageUsageDto } from './slices/file/file.dto';
export {
  createFolderAction,
  deleteFolderAction,
  moveFolderAction,
  renameFolderAction,
} from './slices/folder/folder.actions';
export type {
  DocumentFolderDto,
  FolderCrumbDto,
  FolderDeletedDto,
} from './slices/folder/folder.dto';
export {
  createTagAction,
  deleteTagAction,
  setDocumentTagsAction,
  updateTagAction,
} from './slices/tag/tag.actions';
export type { TagDto } from './slices/tag/tag.dto';
export {
  linkDocumentToTaskAction,
  searchDocumentsForLinkAction,
  searchTasksForLinkAction,
  unlinkDocumentFromTaskAction,
} from './slices/task-link/task-link.actions';
export type { LinkedDocumentDto, LinkedTaskDto } from './slices/task-link/task-link.dto';
export type { DocumentListPageDto, DocumentsOverviewDto } from './slices/views/views.dto';
