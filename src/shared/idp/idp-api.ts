import 'server-only';

import { z } from 'zod';

import { idpRequest } from './idp-client';
import { parseIdpAuditPage, type IdpAuditPage } from './idp-audit';

// Запросы к API журнала и Admin API IdP. `sub` и `actor` — id пользователей в IdP.

function userPath(sub: string, suffix = ''): string {
  return `/api/admin/users/${encodeURIComponent(sub)}${suffix}`;
}

/** Свой журнал безопасности пользователя. */
export async function listIdpUserEvents(sub: string, cursor: string | null): Promise<IdpAuditPage> {
  const body = await idpRequest(`/api/audit/users/${encodeURIComponent(sub)}/events`, {
    query: { cursor },
  });
  return parseIdpAuditPage(body);
}

/** Всё о пользователе для админки: его события и действия администраторов над ним. */
export async function listIdpAdminUserEvents(
  sub: string,
  actor: string,
  cursor: string | null,
): Promise<IdpAuditPage> {
  const body = await idpRequest(`/api/audit/admin/users/${encodeURIComponent(sub)}/events`, {
    query: { actor, cursor },
  });
  return parseIdpAuditPage(body);
}

const idpAccountStateSchema = z.object({
  user: z.object({
    emailVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
    hasPassword: z.boolean(),
  }),
});

export type IdpAccountState = z.infer<typeof idpAccountStateSchema>['user'];

/** Состояние учётной записи в IdP: подтверждение email, 2FA, пароль. */
export async function getIdpAccountState(sub: string, actor: string): Promise<IdpAccountState> {
  const body = await idpRequest(userPath(sub), { query: { actor } });
  return idpAccountStateSchema.parse(body).user;
}

/** Действие Admin API над учётной записью (`actor` — администратор). */
export type IdpAdminAction =
  | { kind: 'ban'; banReason?: string; banExpiresIn?: number }
  | { kind: 'unban' }
  | { kind: 'role'; role: 'user' | 'admin' }
  | { kind: 'revokeSessions' }
  | { kind: 'resetTwoFactor' }
  | { kind: 'verifyEmail' }
  | { kind: 'sendPasswordReset' }
  | { kind: 'sendVerification' };

const ACTION_PATHS: Record<IdpAdminAction['kind'], string> = {
  ban: '/ban',
  unban: '/unban',
  role: '/role',
  revokeSessions: '/sessions/revoke',
  resetTwoFactor: '/two-factor/reset',
  verifyEmail: '/email/verify',
  sendPasswordReset: '/emails/password-reset',
  sendVerification: '/emails/verification',
};

export async function runIdpAdminAction(
  sub: string,
  actor: string,
  action: IdpAdminAction,
): Promise<void> {
  const { kind, ...fields } = action;
  await idpRequest(userPath(sub, ACTION_PATHS[kind]), {
    method: 'POST',
    body: { actor, ...fields },
  });
}
