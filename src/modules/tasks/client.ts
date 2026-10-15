/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { findCardColumn, moveCard, prevTaskIdAt } from './models/board-move';
export type { BoardColumns } from './models/board-move';
export {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PLACEMENT_LIMIT,
  TASK_TITLE_MAX_LENGTH,
} from './models/task';
export { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from './models/task-priority';
export type { TaskPriority } from './models/task-priority';
export {
  addToProjectAction,
  changeStatusAction,
  movePlacementAction,
  removeFromProjectAction,
} from './slices/placement/placement.actions';
export {
  createTaskAction,
  deleteTaskAction,
  loadMoreTasksAction,
  quickCreateTaskAction,
  updateTaskAction,
} from './slices/task/task.actions';
export type {
  TaskDto,
  TaskListItemDto,
  TaskPageDto,
  TaskPlacementDto,
  TaskUserDto,
} from './slices/task/task.dto';
export { createTaskSchema, taskNumberSchema, updateTaskSchema } from './slices/task/task.schema';
export type { BoardCardDto, BoardCardsDto } from './slices/views/views.dto';
