// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: tasks → projects, workspaces, notifications (через их index.ts); обратных нет.
// Сервисы изменения (createTask, changeStatus, createComment…) — для agent-mcp: те же проверки, что у actions.
export * from './client';

export {
  completeUpload as completeAttachmentUpload,
  getAttachmentDownload,
  getTotalAttachmentStorageUsage,
  listTaskAttachments,
  requestUpload as requestAttachmentUpload,
} from './slices/attachment/attachment.service';
export { assertTaskActive } from './slices/task/task-archive.guard';
export { exportTasks } from './slices/views/task-export.service';
export type { TaskExportResult } from './slices/views/task-export.service';
export { getWorkspaceDashboard } from './slices/dashboard/dashboard.service';
export { createComment, listTaskComments } from './slices/comment/comment.service';
export { listTaskHistory } from './slices/history/history.service';
export {
  createLabel,
  ensureLabelsByNames,
  listLabels,
  setTaskLabels,
} from './slices/label/label.service';
export { listSavedViews } from './slices/saved-view/saved-view.service';
export { searchTasks } from './slices/search/search.service';
export { listSubtasks, setTaskParent } from './slices/subtask/subtask.service';
export { sendDueReminders } from './slices/reminder/reminder.service';
export type { DueRemindersResult } from './slices/reminder/reminder.service';
export { listTaskWatchers, listWatcherIds } from './slices/watcher/watcher.service';
export { emitTaskEvent } from './slices/realtime/task-events.service';
export {
  archiveTask,
  createTask,
  getTaskByNumber,
  resolveTaskRefs,
  resolveTaskRefsByIds,
  restoreTask,
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
  listMyTasks,
  listProjectTasks,
  listTasks,
} from './slices/views/views.queries';
