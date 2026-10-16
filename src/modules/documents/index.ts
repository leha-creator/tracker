// Публичный API модуля для серверного кода (страницы, route handlers).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: documents → tasks (через его index.ts); tasks о документах не знает.
export * from './client';

export { parseDocumentListParams } from './models';
export { getDocument } from './slices/document/document.service';
export {
  getDocumentFile,
  getDocumentText,
  getWorkspaceStorageUsage,
} from './slices/file/file.service';
export type { DocumentFileResponse } from './slices/file/file.dto';
export { listFolderTree } from './slices/folder/folder.service';
export { listTags } from './slices/tag/tag.service';
export {
  linkDocumentToTask,
  listDocumentTasks,
  listTaskDocuments,
} from './slices/task-link/task-link.service';
export { getDocumentsOverview, listDocuments } from './slices/views/views.queries';
