/**
 * Публичный API модуля для клиентских компонентов: Server Actions, схемы, чистые функции и типы.
 * Без server-only кода (сервисов, репозиториев) — их экспортирует только index.ts.
 */
export {
  acceptInvitationAction,
  cancelInvitationAction,
  inviteMemberAction,
  rejectInvitationAction,
} from './slices/invitation/invitation.actions';
export type {
  InviteMemberResult,
  PendingInvitationDto,
  RecipientInvitationDto,
} from './slices/invitation/invitation.dto';
export { inviteMemberSchema } from './slices/invitation/invitation.schema';
export {
  changeMemberRoleAction,
  leaveWorkspaceAction,
  removeMemberAction,
  setMemberPermissionAction,
} from './slices/member/member.actions';
export type {
  MemberDto,
  MemberIdentityDto,
  SoleOwnedWorkspaceDto,
  WorkspaceMemberDto,
} from './slices/member/member.dto';
export {
  createWorkspaceAction,
  deleteWorkspaceAction,
  renameWorkspaceAction,
  updateTaskKeyAction,
} from './slices/workspace/workspace.actions';
export type {
  WorkspaceListItemDto,
  WorkspaceSummaryDto,
  WorkspaceTaskKeyDto,
} from './slices/workspace/workspace.dto';
export {
  createWorkspaceSchema,
  WORKSPACE_NAME_MAX_LENGTH,
  WORKSPACE_NAME_MIN_LENGTH,
} from './slices/workspace/workspace.schema';
export { SLUG_MAX_LENGTH, slugify } from './models/workspace-slug';
export {
  normalizeTaskKey,
  suggestTaskKey,
  TASK_KEY_MAX_LENGTH,
  TASK_KEY_PATTERN,
  taskKeyProblem,
} from './models/task-key';
export type { InvitationState } from './models/invitation';
export type { FormState } from '@/shared/types';
