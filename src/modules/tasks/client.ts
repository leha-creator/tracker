/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, константы и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export { findCardColumn, moveCard, nextBoardFocus, prevTaskIdAt } from './models/board-move';
export {
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  mentionText,
} from './models/comment-mentions';
export type { MentionCandidate, MentionRange } from './models/comment-mentions';
export type { BoardColumns, BoardFocusDirection } from './models/board-move';
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
  defaultTaskListQuery,
  hasActiveFilters,
  pageBounds,
  paginationRange,
  parseTaskListParams,
  patchTaskListQuery,
  serializeTaskListParams,
  TASK_DUE_FILTER_LABELS,
  TASK_DUE_FILTERS,
  TASK_LIST_ME,
  TASK_LIST_MAX_VALUES,
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
export {
  TASK_LABEL_COLORS,
  TASK_LABEL_NAME_MAX_LENGTH,
  TASK_LABELS_ON_CARD,
  TASK_LABELS_PER_TASK,
  TASK_LABELS_PER_WORKSPACE,
} from './models/task-label';
export type { TaskLabelColor } from './models/task-label';
export { barPercent } from './models/dashboard';
export {
  canonicalViewParams,
  SAVED_VIEW_NAME_MAX_LENGTH,
  SAVED_VIEWS_PER_SCOPE,
} from './models/saved-task-view';
export type { SavedTaskViewScope } from './models/saved-task-view';
export { TASK_MAX_DEPTH, TASK_SUBTASKS_LIMIT } from './models/task-tree';
export type { SubtaskProgress } from './models/task-tree';
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
export type { WorkspaceDashboardDto } from './slices/dashboard/dashboard.dto';
export type { DashboardCounts, ProjectCountRow, WorkloadItem } from './models/dashboard';
export type { TaskHistoryDto, TaskHistoryItemDto } from './slices/history/history.dto';
export {
  createLabelAction,
  createLabelFormAction,
  deleteLabelAction,
  setTaskLabelsAction,
  updateLabelAction,
} from './slices/label/label.actions';
export type { TaskLabelDto, TaskLabelRefDto } from './slices/label/label.dto';
export {
  createSavedViewAction,
  deleteSavedViewAction,
  renameSavedViewAction,
} from './slices/saved-view/saved-view.actions';
export type { SavedTaskViewDto } from './slices/saved-view/saved-view.dto';
export type { TaskSearchResultDto } from './slices/search/search.dto';
export { setWatchingAction } from './slices/watcher/watcher.actions';
export type { TaskWatchersDto } from './slices/watcher/watcher.dto';
export {
  searchParentCandidatesAction,
  setTaskParentAction,
} from './slices/subtask/subtask.actions';
export type {
  SubtaskDto,
  SubtasksDto,
  TaskAncestorDto,
  TaskParentOptionDto,
} from './slices/subtask/subtask.dto';
export { PARENT_SEARCH_MAX_LENGTH } from './slices/subtask/subtask.schema';
export {
  archiveTaskAction,
  createTaskAction,
  deleteTaskAction,
  quickCreateTaskAction,
  restoreTaskAction,
  updateTaskAction,
} from './slices/task/task.actions';
export type {
  TaskDto,
  TaskListItemDto,
  TaskPlacementDto,
  TaskRefDto,
  TaskUserDto,
} from './slices/task/task.dto';
export { createTaskSchema, taskNumberSchema, updateTaskSchema } from './slices/task/task.schema';
export type {
  BoardCardDto,
  BoardCardsDto,
  MemberTaskSummaryDto,
  MyTaskListItemDto,
  MyTaskListPageDto,
  MyTaskWorkspaceDto,
  TaskListPageDto,
  TaskSummaryDto,
} from './slices/views/views.dto';
