// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: tasks → projects, workspaces, notifications (через их index.ts); обратных нет.
export * from './client';

export { getAttachmentDownload, listTaskAttachments } from './slices/attachment/attachment.service';
export { listTaskComments } from './slices/comment/comment.service';
export { listSubtasks } from './slices/subtask/subtask.service';
export { getTaskByNumber, resolveTaskRefs, resolveTaskRefsByIds } from './slices/task/task.service';
export {
  changePlacementStatusBySystem,
  listPlacementsForAutomation,
} from './slices/placement/placement.service';
export {
  getBoardCards,
  getMemberTaskSummary,
  getTaskSummaries,
  listProjectTasks,
  listTasks,
} from './slices/views/views.queries';
