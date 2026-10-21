// Публичный API модуля для серверного кода (страницы, route handlers).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: documents → tasks (через его index.ts); tasks о документах не знает.
// Сервисы изменения (createNote, updateNote, …) — для agent-mcp: те же правила, что у actions.
export * from './client';

export { parseDocumentListParams } from './models';
export { createNote, getDocument, updateNote } from './slices/document/document.service';
export {
  completeDocumentUpload,
  getDocumentFile,
  getDocumentText,
  getStorageUsageByWorkspaces,
  getTotalDocumentStorageUsage,
  getWorkspaceStorageUsage,
  requestDocumentUpload,
} from './slices/file/file.service';
export type { DocumentFileResponse } from './slices/file/file.dto';
// Только для integrations/meet: заметка-конспект в транзакции вебхука, без проверки прав.
export { createSystemTaskNote } from './slices/system/system-note.service';
export { createFolder, listFolderTree } from './slices/folder/folder.service';
export { listTags, setDocumentTags } from './slices/tag/tag.service';
export {
  linkDocumentToTask,
  listDocumentTasks,
  listTaskDocuments,
  unlinkDocumentFromTask,
} from './slices/task-link/task-link.service';
export { getDocumentsOverview, listDocuments, searchDocuments } from './slices/views/views.queries';
