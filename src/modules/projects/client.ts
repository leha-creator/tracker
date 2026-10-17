/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  archiveProjectAction,
  createProjectAction,
  deleteProjectAction,
  restoreProjectAction,
  updateProjectAction,
} from './slices/project/project.actions';
export type { ProjectDto, ProjectListItemDto } from './slices/project/project.dto';
export {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from './slices/project/project.schema';
export {
  addStatusAction,
  deleteStatusAction,
  moveStatusAction,
  updateStatusAction,
} from './slices/status/status.actions';
export type { ProjectStatusDto } from './slices/status/status.dto';
export { addStatusSchema, updateStatusSchema } from './slices/status/status.schema';
export {
  ARCHIVED_PROJECT_MESSAGE,
  assertProjectNotArchived,
  isEntityId,
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
} from './models/project';
export {
  completionPercent,
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
} from './models/status-category';
export type { StatusCategory, TasksByCategory } from './models/status-category';
export { parseStatusColor, STATUS_COLOR_LABELS, STATUS_COLORS } from './models/status-color';
export type { StatusColor } from './models/status-color';
export { reorderStatuses } from './models/status-order';
export { STATUS_LIMIT, STATUS_NAME_MAX_LENGTH } from './models/status-set';
