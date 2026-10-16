/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { findCardColumn, moveCard, prevTaskIdAt } from './models/board-move';
export {
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  mentionText,
} from './models/comment-mentions';
export type { MentionCandidate, MentionRange } from './models/comment-mentions';
export type { BoardColumns } from './models/board-move';
export {
  MEMBER_DONE_RECENT_DAYS,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PLACEMENT_LIMIT,
  TASK_TITLE_MAX_LENGTH,
} from './models/task';
export {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  attachmentLimit,
  COMMENT_ATTACHMENTS_LIMIT,
  findAttachmentType,
  formatFileSize,
  TASK_ATTACHMENTS_LIMIT,
} from './models/task-attachment';
export type { AttachmentKind, AttachmentTarget } from './models/task-attachment';
export { TASK_COMMENT_MAX_LENGTH } from './models/task-comment';
export {
  clearFilters,
  hasActiveFilters,
  pageBounds,
  paginationRange,
  parseTaskListParams,
  patchTaskListQuery,
  serializeTaskListParams,
  TASK_DUE_FILTER_LABELS,
  TASK_DUE_FILTERS,
  TASK_LIST_ME,
  TASK_LIST_NONE,
  TASK_LIST_QUERY_MAX_LENGTH,
  TASK_LIST_SORT_LABELS,
  toggleSort,
} from './models/task-list-query';
export type {
  PaginationItem,
  SortDirection,
  TaskCategoryFilter,
  TaskDueFilter,
  TaskListQuery,
  TaskListScope,
  TaskListSort,
} from './models/task-list-query';
export { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from './models/task-priority';
export type { TaskPriority } from './models/task-priority';
export {
  addToProjectAction,
  changeStatusAction,
  movePlacementAction,
  removeFromProjectAction,
} from './slices/placement/placement.actions';
export {
  completeAttachmentUploadAction,
  deleteAttachmentAction,
  requestAttachmentUploadAction,
} from './slices/attachment/attachment.actions';
export type { AttachmentUploadDto, TaskAttachmentDto } from './slices/attachment/attachment.dto';
export {
  createCommentAction,
  deleteCommentAction,
  updateCommentAction,
} from './slices/comment/comment.actions';
export type { TaskCommentDto, TaskCommentsDto } from './slices/comment/comment.dto';
export {
  createTaskAction,
  deleteTaskAction,
  quickCreateTaskAction,
  updateTaskAction,
} from './slices/task/task.actions';
export type {
  TaskDto,
  TaskListItemDto,
  TaskPlacementDto,
  TaskUserDto,
} from './slices/task/task.dto';
export { createTaskSchema, taskNumberSchema, updateTaskSchema } from './slices/task/task.schema';
export type {
  BoardCardDto,
  BoardCardsDto,
  MemberTaskSummaryDto,
  TaskListPageDto,
  TaskSummaryDto,
} from './slices/views/views.dto';
