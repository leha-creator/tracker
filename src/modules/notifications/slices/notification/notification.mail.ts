import { escapeHtml } from '@/shared/mail/escape-html';
import { MAIL_COLORS, MAIL_STYLES, renderMailLayout } from '@/shared/mail/mail-layout';

import type { NotificationText } from '../../models';

export interface NotificationMailInput {
  text: NotificationText;
  actorName: string | null;
  workspaceName: string;
  /** Абсолютная ссылка на задачу или приглашение. */
  url: string;
  /** Абсолютная ссылка на настройки уведомлений. */
  settingsUrl: string;
}

/** Письмо-уведомление. Все пользовательские данные экранируются в HTML-версии. */
export function buildNotificationMail(input: NotificationMailInput) {
  const { text } = input;
  const subject = `${text.title}: ${text.subject} — Tasker`;
  const who = input.actorName ? `${input.actorName} · ` : '';

  const plain = [
    `${text.title}`,
    `${who}${text.subject} (пространство «${input.workspaceName}»)`,
    ...(text.excerpt ? ['', `«${text.excerpt}»`] : []),
    '',
    `Открыть: ${input.url}`,
    '',
    `Настроить уведомления: ${input.settingsUrl}`,
  ].join('\n');

  const html = renderMailLayout({
    content: `<p style="${MAIL_STYLES.paragraph}"><strong>${escapeHtml(text.title)}</strong></p>
          <p style="${MAIL_STYLES.paragraph}">${escapeHtml(who)}${escapeHtml(text.subject)}
            <span style="color: ${MAIL_COLORS.muted};">(пространство «${escapeHtml(input.workspaceName)}»)</span></p>${
              text.excerpt
                ? `\n          <blockquote style="${MAIL_STYLES.quote}">${escapeHtml(text.excerpt)}</blockquote>`
                : ''
            }`,
    action: { label: 'Открыть в Tasker', url: input.url },
    footer: `Письма приходят по настройкам уведомлений — <a href="${escapeHtml(input.settingsUrl)}" style="color: ${MAIL_COLORS.brand};">изменить</a>.`,
  });

  return { subject, text: plain, html };
}
