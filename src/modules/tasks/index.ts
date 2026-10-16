// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: tasks → projects, workspaces, notifications (через их index.ts); обратных нет.
// Сервисы изменения (createTask, changeStatus, createComment…) — для agent-mcp: те же проверки, что у actions.
export * from './client';

export {
  completeUpload as completeAttachmentUpload,
  getAttachmentDownload,
  listTaskAttachments,
  requestUpload as requestAttachmentUpload,
} from './slices/attachment/attachment.service';
export { createComment, listTaskComments } from './slices/comment/comment.service';
export { listSubtasks, setTaskParent } from './slices/subtask/subtask.service';
export {
  createTask,
  getTaskByNumber,
  resolveTaskRefs,
  resolveTaskRefsByIds,
  updateTask,
} from './slices/task/task.service';
export type { CreateTaskInput, UpdateTaskInput } from './slices/task/task.service';
export {
  addToProject,
  changePlacementStatusBySystem,
  changeStatus,
  listPlacementsForAutomation,
} from './slices/placement/placement.service';
export {
  getBoardCards,
  getMemberTaskSummary,
  getTaskSummaries,
  listProjectTasks,
  listTasks,
} from './slices/views/views.queries';
