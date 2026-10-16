import { escapeHtml } from '@/shared/mail/escape-html';

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

  const html = `<!doctype html>
<html lang="ru">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
    <p><strong>${escapeHtml(text.title)}</strong></p>
    <p>${escapeHtml(who)}${escapeHtml(text.subject)}
      <span style="color: #666;">(пространство «${escapeHtml(input.workspaceName)}»)</span></p>
    ${
      text.excerpt
        ? `<blockquote style="margin: 0 0 1em; padding-left: 12px; border-left: 3px solid #ddd; color: #444;">${escapeHtml(text.excerpt)}</blockquote>`
        : ''
    }
    <p><a href="${escapeHtml(input.url)}">Открыть в Tasker</a></p>
    <p style="color: #666; font-size: 13px;">Письма приходят по настройкам уведомлений —
      <a href="${escapeHtml(input.settingsUrl)}">изменить</a>.</p>
  </body>
</html>`;

  return { subject, text: plain, html };
}
