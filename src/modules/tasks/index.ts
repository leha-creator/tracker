// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: tasks → projects, workspaces, notifications (через их index.ts); обратных нет.
export * from './client';

export { getAttachmentDownload, listTaskAttachments } from './slices/attachment/attachment.service';
export { listTaskComments } from './slices/comment/comment.service';
export { getTaskByNumber } from './slices/task/task.service';
export {
  getBoardCards,
  getMemberTaskSummary,
  listProjectTasks,
  listTasks,
} from './slices/views/views.queries';
