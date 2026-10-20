import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { escapeHtml } from '@/shared/mail/escape-html';
import { MAIL_STYLES, renderMailLayout } from '@/shared/mail/mail-layout';

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

  const html = renderMailLayout({
    content: `<p style="${MAIL_STYLES.paragraph}"><strong>${escapeHtml(input.inviterName)}</strong> приглашает вас в пространство
            «${escapeHtml(input.workspaceName)}» в Tasker.</p>
          <p style="${MAIL_STYLES.paragraph}">Роль: ${role}.</p>`,
    action: { label: 'Принять приглашение', url: input.inviteUrl },
    footer: `Ссылка действует до ${expires}. Если вы не ждали этого письма, просто проигнорируйте его.`,
  });

  return { subject, text, html };
}
