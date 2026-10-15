import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { escapeHtml } from '@/shared/mail/escape-html';

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: 'владелец', member: 'участник' };

export interface InvitationMailInput {
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  inviteUrl: string;
  expiresAt: Date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Письмо-приглашение. Все пользовательские данные экранируются в HTML-версии. */
export function buildInvitationMail(input: InvitationMailInput) {
  const role = ROLE_LABELS[input.role];
  const expires = formatDate(input.expiresAt);
  const subject = `Приглашение в пространство «${input.workspaceName}» — Tasker`;

  const text = [
    `${input.inviterName} приглашает вас в пространство «${input.workspaceName}» в Tasker.`,
    `Роль: ${role}.`,
    '',
    `Принять приглашение: ${input.inviteUrl}`,
    '',
    `Ссылка действует до ${expires}. Если вы не ждали этого письма, просто проигнорируйте его.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="ru">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
    <p><strong>${escapeHtml(input.inviterName)}</strong> приглашает вас в пространство
      «${escapeHtml(input.workspaceName)}» в Tasker.</p>
    <p>Роль: ${role}.</p>
    <p><a href="${escapeHtml(input.inviteUrl)}">Принять приглашение</a></p>
    <p style="color: #666; font-size: 13px;">Ссылка действует до ${expires}.
      Если вы не ждали этого письма, просто проигнорируйте его.</p>
  </body>
</html>`;

  return { subject, text, html };
}
