import 'server-only';

import { parseWorkspaceRole, requireWorkspaceAccess, type WorkspaceRole } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { InternalError, NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger, maskEmail } from '@/shared/logger';
import { sendMail } from '@/shared/mail';

import { Invitation, invitationUrl, parseInvitationStatus } from '../../models';
import { callOrganizationApi } from '../../organization-api';
import { workspaceRepository } from '../workspace/workspace.repository';
import type {
  InviteMemberResult,
  PendingInvitationDto,
  RecipientInvitationDto,
} from './invitation.dto';
import { buildInvitationMail } from './invitation.mail';
import { invitationRepository } from './invitation.repository';

const log = createLogger('workspaces.invitation');

interface InvitationRow {
  id: string;
  workspaceId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
}

function toModel(row: InvitationRow): Invitation {
  return new Invitation(
    row.id,
    row.workspaceId,
    row.email,
    // Роль не задана или неизвестна → минимальная, без повышения прав.
    parseWorkspaceRole(row.role) ?? 'member',
    parseInvitationStatus(row.status),
    row.expiresAt,
  );
}

function urlFor(invitationId: string): string {
  return invitationUrl(getEnv().BETTER_AUTH_URL, invitationId);
}

export async function inviteMember(
  session: AuthSession,
  input: { workspaceId: string; email: string; role: WorkspaceRole },
): Promise<InviteMemberResult> {
  const { workspaceId, email, role } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug(
    { userId: session.user.id, workspaceId, email: maskEmail(email), role },
    '[invitation.invite] start',
  );

  if (email === session.user.email.toLowerCase()) {
    throw new ValidationError('Нельзя пригласить самого себя', {
      fieldErrors: { email: ['Это ваш email'] },
    });
  }

  const workspace = await workspaceRepository.findById(workspaceId);
  if (!workspace) throw new NotFoundError('Пространство не найдено');

  const invitation = await callOrganizationApi((api, headers) =>
    api.createInvitation({ body: { organizationId: workspaceId, email, role }, headers }),
  );
  if (!invitation) throw new InternalError('Плагин не вернул созданное приглашение');

  const inviteUrl = urlFor(invitation.id);
  let emailSent = false;
  try {
    await sendMail({
      to: email,
      ...buildInvitationMail({
        workspaceName: workspace.name,
        inviterName: session.user.name,
        role,
        inviteUrl,
        expiresAt: invitation.expiresAt,
      }),
    });
    emailSent = true;
  } catch (error) {
    // Приглашение уже создано: владелец передаст ссылку вручную.
    log.error(
      { err: error, workspaceId, invitationId: invitation.id },
      '[invitation] email failed',
    );
  }

  log.info({ workspaceId, invitationId: invitation.id, role, emailSent }, '[invitation] created');
  return { invitationId: invitation.id, inviteUrl, emailSent };
}

export async function listInvitations(
  session: AuthSession,
  workspaceId: string,
): Promise<PendingInvitationDto[]> {
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId }, '[invitation.list]');

  const rows = await invitationRepository.listPending(workspaceId, new Date());
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: toModel(row).role,
    expiresAt: row.expiresAt,
    inviterName: row.inviter.name,
    inviteUrl: urlFor(row.id),
  }));
}

export async function cancelInvitation(
  session: AuthSession,
  input: { workspaceId: string; invitationId: string },
): Promise<void> {
  const { workspaceId, invitationId } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug({ userId: session.user.id, workspaceId, invitationId }, '[invitation.cancel] start');

  const row = await invitationRepository.findInWorkspace(workspaceId, invitationId);
  if (!row || row.status !== 'pending') {
    throw new NotFoundError('Приглашение не найдено или уже недействительно');
  }

  await callOrganizationApi((api, headers) =>
    api.cancelInvitation({ body: { invitationId }, headers }),
  );
  log.info({ workspaceId, invitationId, byUserId: session.user.id }, '[invitation] cancelled');
}

/** Приглашение для страницы адресата. Не найдено → NOT_FOUND; остальные состояния — в `state`. */
export async function getInvitationForRecipient(
  session: AuthSession,
  invitationId: string,
): Promise<RecipientInvitationDto> {
  log.debug({ userId: session.user.id, invitationId }, '[invitation.getForRecipient]');
  const row = await invitationRepository.findForRecipient(invitationId);
  if (!row) throw new NotFoundError('Приглашение не найдено');

  const invitation = toModel(row);
  const state = invitation.stateFor(session.user.email, new Date());
  if (state === 'wrong-recipient') {
    log.warn(
      { userId: session.user.id, invitationId },
      '[invitation.getForRecipient] wrong recipient',
    );
  }

  return {
    id: invitation.id,
    state,
    workspaceName: row.workspace.name,
    inviterName: row.inviter.name,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    maskedEmail: maskEmail(invitation.email),
  };
}

async function loadActionable(session: AuthSession, invitationId: string) {
  const row = await invitationRepository.findForRecipient(invitationId);
  if (!row) throw new NotFoundError('Приглашение не найдено');
  const invitation = toModel(row);
  try {
    invitation.assertAcceptableBy(session.user.email, new Date());
  } catch (error) {
    log.warn({ userId: session.user.id, invitationId }, '[invitation] not actionable for user');
    throw error;
  }
  return { invitation, workspaceSlug: row.workspace.slug };
}

/** Принимает приглашение. Возвращает slug пространства для редиректа. */
export async function acceptInvitation(
  session: AuthSession,
  input: { invitationId: string },
): Promise<{ workspaceSlug: string }> {
  const { invitation, workspaceSlug } = await loadActionable(session, input.invitationId);

  await callOrganizationApi((api, headers) =>
    api.acceptInvitation({ body: { invitationId: invitation.id }, headers }),
  );
  log.info(
    { workspaceId: invitation.workspaceId, invitationId: invitation.id, userId: session.user.id },
    '[invitation] accepted',
  );
  return { workspaceSlug };
}

export async function rejectInvitation(
  session: AuthSession,
  input: { invitationId: string },
): Promise<void> {
  const { invitation } = await loadActionable(session, input.invitationId);

  await callOrganizationApi((api, headers) =>
    api.rejectInvitation({ body: { invitationId: invitation.id }, headers }),
  );
  log.info(
    { workspaceId: invitation.workspaceId, invitationId: invitation.id, userId: session.user.id },
    '[invitation] rejected',
  );
}
