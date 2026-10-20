import { getEnv } from '@/shared/env';

import { escapeHtml } from './escape-html';

/**
 * Цвета писем — HEX-копии токенов (src/components/design-system/token-catalog.ts, STATIC_HEX):
 * почтовые клиенты не понимают CSS-переменные и oklch. Тест каталога сверяет их с токенами.
 */
export const MAIL_COLORS = {
  brand: '#475cad',
  text: '#15181f',
  muted: '#5f636d',
  border: '#e1e3e7',
  background: '#f9fafc',
} as const;

/** Inline-стили частей письма: абзацы, вторичный текст и цитата. */
export const MAIL_STYLES = {
  paragraph: 'margin: 0 0 16px;',
  muted: `margin: 0 0 16px; color: ${MAIL_COLORS.muted}; font-size: 13px;`,
  quote: `margin: 0 0 16px; padding-left: 12px; border-left: 3px solid ${MAIL_COLORS.border}; color: ${MAIL_COLORS.muted};`,
} as const;

export interface MailLayoutInput {
  /** Готовый HTML тела: пользовательские данные вызывающий уже экранировал. */
  content: string;
  /** Кнопка действия; подпись и адрес экранируются здесь. */
  action?: { label: string; url: string };
  /** Готовый HTML подвала (вторичный текст под чертой). */
  footer?: string;
}

/** Общий HTML-шаблон писем: логотип, тело, кнопка цвета бренда, подвал. Только inline-стили, ширина 560 px. */
export function renderMailLayout({ content, action, footer }: MailLayoutInput): string {
  const logoUrl = new URL('/brand/logo-mail.png', getEnv().BETTER_AUTH_URL).toString();
  const button = action
    ? `<p style="margin: 24px 0;"><a href="${escapeHtml(action.url)}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: ${MAIL_COLORS.brand}; color: #ffffff; font-weight: 600; text-decoration: none;">${escapeHtml(action.label)}</a></p>
          <p style="${MAIL_STYLES.muted}">Если кнопка не открывается, скопируйте ссылку: <a href="${escapeHtml(action.url)}" style="color: ${MAIL_COLORS.brand}; word-break: break-all;">${escapeHtml(action.url)}</a></p>`
    : '';
  const footerBlock = footer
    ? `<tr><td style="padding: 16px 32px 0; border-top: 1px solid ${MAIL_COLORS.border}; color: ${MAIL_COLORS.muted}; font-size: 13px;">${footer}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="ru">
  <body style="margin: 0; padding: 24px 12px; background: ${MAIL_COLORS.background}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.5; color: ${MAIL_COLORS.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid ${MAIL_COLORS.border}; border-radius: 12px; padding: 0 0 24px;">
      <tr><td style="padding: 24px 32px 8px;"><img src="${escapeHtml(logoUrl)}" width="120" height="32" alt="Tasker" style="display: block; border: 0;"></td></tr>
      <tr><td style="padding: 16px 32px 8px;">
          ${content}
          ${button}
      </td></tr>
      ${footerBlock}
    </table>
  </body>
</html>`;
}
