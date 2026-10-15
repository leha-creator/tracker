import type { WorkspaceRole } from '@/shared/access/workspace-role';

import type { InvitationState } from '../../models';

/** Ожидающее приглашение — для владельца пространства. */
export interface PendingInvitationDto {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date;
  inviterName: string;
  inviteUrl: string;
}

/** Приглашение глазами адресата (страница /invite/[id]). */
export interface RecipientInvitationDto {
  id: string;
  state: InvitationState;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  expiresAt: Date;
  /** Email адресата в маскированном виде — для подсказки при входе не под тем аккаунтом. */
  maskedEmail: string;
}

export interface InviteMemberResult {
  invitationId: string;
  inviteUrl: string;
  emailSent: boolean;
}
