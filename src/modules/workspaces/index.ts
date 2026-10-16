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
  sharesWorkspace,
} from './slices/member/member.service';
export { listMyWorkspaces } from './slices/workspace/workspace.service';
