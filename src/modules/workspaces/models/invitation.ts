import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';

export const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Состояние приглашения с точки зрения конкретного пользователя. */
export type InvitationState = 'actionable' | 'expired' | 'processed' | 'wrong-recipient';

export function parseInvitationStatus(value: string): InvitationStatus {
  return INVITATION_STATUSES.find((status) => status === value) ?? 'canceled';
}

/** Ссылка, по которой адресат открывает приглашение. */
export function invitationUrl(baseUrl: string, invitationId: string): string {
  return new URL(`/invite/${encodeURIComponent(invitationId)}`, baseUrl).toString();
}

export class Invitation {
  constructor(
    readonly id: string,
    readonly workspaceId: string,
    readonly email: string,
    readonly role: WorkspaceRole,
    readonly status: InvitationStatus,
    readonly expiresAt: Date,
  ) {}

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  isAddressedTo(email: string): boolean {
    return this.email.trim().toLowerCase() === email.trim().toLowerCase();
  }

  /** Порядок проверок: обработанное или истёкшее приглашение важнее, чем чужой адресат. */
  stateFor(email: string, now: Date): InvitationState {
    if (this.status !== 'pending') return 'processed';
    if (this.isExpired(now)) return 'expired';
    if (!this.isAddressedTo(email)) return 'wrong-recipient';
    return 'actionable';
  }

  assertAcceptableBy(email: string, now: Date): void {
    switch (this.stateFor(email, now)) {
      case 'processed':
        throw new ValidationError('Приглашение уже недействительно');
      case 'expired':
        throw new ValidationError('Срок действия приглашения истёк');
      case 'wrong-recipient':
        throw new ForbiddenError('Приглашение адресовано другому пользователю');
      case 'actionable':
        return;
    }
  }
}
