import { escapeHtml } from '@/shared/mail/escape-html';
import { MAIL_STYLES, renderMailLayout } from '@/shared/mail/mail-layout';

/** Письмо: тема, текст и HTML. Пользовательские данные в HTML экранируются. */
export interface AuthEmail {
  subject: string;
  text: string;
  html: string;
}

interface Paragraph {
  text: string;
  muted?: boolean;
}

function render(subject: string, paragraphs: Paragraph[], link?: { label: string; url: string }) {
  const plain = [
    ...paragraphs.map((paragraph) => paragraph.text),
    ...(link ? [`${link.label}: ${link.url}`] : []),
  ].join('\n\n');

  const paragraphHtml = (paragraph: Paragraph) =>
    `<p style="${paragraph.muted ? MAIL_STYLES.muted : MAIL_STYLES.paragraph}">${escapeHtml(paragraph.text)}</p>`;
  // Вторичные абзацы (оговорки «если это были не вы») — в подвал, под кнопку.
  const footer = paragraphs
    .filter((paragraph) => paragraph.muted)
    .map((paragraph) => escapeHtml(paragraph.text))
    .join('<br>');

  const html = renderMailLayout({
    content: paragraphs
      .filter((paragraph) => !paragraph.muted)
      .map(paragraphHtml)
      .join('\n'),
    action: link,
    footer: footer || undefined,
  });

  return { subject, text: plain, html } satisfies AuthEmail;
}

function greeting(name: string): Paragraph {
  return { text: `Здравствуйте, ${name}!` };
}

/** Ссылка на сброс пароля (действует 1 час). */
export function buildPasswordResetEmail(input: { name: string; url: string }): AuthEmail {
  return render(
    'Сброс пароля — Tasker',
    [
      greeting(input.name),
      { text: 'Мы получили запрос на сброс пароля. Ссылка действует 1 час.' },
      {
        text: 'Если вы не запрашивали сброс, просто проигнорируйте письмо — пароль не изменится.',
        muted: true,
      },
    ],
    { label: 'Задать новый пароль', url: input.url },
  );
}

/** Ссылка на подтверждение email (действует 24 часа). */
export function buildVerificationEmail(input: { name: string; url: string }): AuthEmail {
  return render(
    'Подтвердите email — Tasker',
    [
      greeting(input.name),
      {
        text: 'Подтвердите адрес электронной почты, чтобы войти в Tasker. Ссылка действует 24 часа.',
      },
      { text: 'Если вы не регистрировались в Tasker, проигнорируйте письмо.', muted: true },
    ],
    { label: 'Подтвердить email', url: input.url },
  );
}

/** Уведомление о смене или сбросе пароля. */
export function buildPasswordChangedEmail(input: {
  name: string;
  forgotPasswordUrl: string;
}): AuthEmail {
  return render(
    'Пароль изменён — Tasker',
    [
      greeting(input.name),
      { text: 'Пароль от вашего аккаунта Tasker только что изменён.' },
      {
        text: 'Если это были не вы, сразу сбросьте пароль и включите двухфакторную аутентификацию в профиле.',
      },
    ],
    { label: 'Сбросить пароль', url: input.forgotPasswordUrl },
  );
}

/** Кто-то пытался зарегистрироваться на уже занятый адрес. */
export function buildSignUpAttemptEmail(input: {
  name: string;
  loginUrl: string;
  forgotPasswordUrl: string;
}): AuthEmail {
  return render(
    'Попытка регистрации — Tasker',
    [
      greeting(input.name),
      {
        text: 'Кто-то пытался зарегистрироваться в Tasker с вашим адресом. Аккаунт у вас уже есть.',
      },
      {
        text: `Если это были вы — просто войдите: ${input.loginUrl}. Забыли пароль — восстановите его по ссылке ниже.`,
      },
      { text: 'Если это были не вы, ничего делать не нужно.', muted: true },
    ],
    { label: 'Восстановить пароль', url: input.forgotPasswordUrl },
  );
}
