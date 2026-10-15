// Публичный API модуля для серверного кода (страницы, другие модули).
// Клиентским компонентам — './client' (без server-only кода).
export * from './client';

export { getInvitationForRecipient, listInvitations } from './slices/invitation/invitation.service';
export { listMembers } from './slices/member/member.service';
export { listMyWorkspaces } from './slices/workspace/workspace.service';
