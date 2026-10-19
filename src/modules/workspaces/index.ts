// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
// Зависимости: workspaces → notifications (уведомление о приглашении).
export * from './client';

export { getInvitationForRecipient, listInvitations } from './slices/invitation/invitation.service';
export {
  countWorkspacesByUsers,
  getMember,
  isWorkspaceMember,
  listMemberIdentities,
  listMembers,
  listSoleOwnedWorkspaces,
  listUserMemberships,
  sharesWorkspace,
} from './slices/member/member.service';
export {
  countAllWorkspaces,
  deleteWorkspaceBySystem,
  getWorkspaceForAdmin,
  listAllWorkspaces,
  setWorkspaceArchivedBySystem,
  setWorkspaceStorageQuota,
  transferWorkspaceOwnership,
} from './slices/system/system.service';
export {
  archiveWorkspace,
  findWorkspacesByTaskKeys,
  listMyWorkspaces,
  restoreWorkspace,
} from './slices/workspace/workspace.service';
