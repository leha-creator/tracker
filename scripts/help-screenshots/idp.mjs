// Регистрация демо-пользователей в локальном IdP plwedding ID и первый вход в Tasker через него.
import { randomBytes } from 'node:crypto';

import { goto } from './browser.mjs';
import { IDP_MAILPIT_URL, IDP_URL } from './config.mjs';

async function waitForVerificationLink(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await fetch(
      `${IDP_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    ).catch(() => null);
    if (search?.ok) {
      const { messages = [] } = await search.json();
      if (messages[0]) {
        const message = await (
          await fetch(`${IDP_MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
        ).json();
        const link = message.Text.match(/https?:\/\/\S*verify-email\S*/)?.[0];
        if (link) return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `письмо подтверждения для ${email} не найдено в Mailpit IdP (${IDP_MAILPIT_URL})`,
  );
}

/**
 * Регистрирует пользователя в IdP, подтверждает email по ссылке из письма (ссылка сразу выполняет
 * вход в IdP) и входит в Tasker кнопкой «Войти через plwedding ID». Cookie остаются в контексте.
 */
export async function signUpThroughIdp(page, { name, email }) {
  const password = `Help-${randomBytes(9).toString('base64url')}`;
  const response = await page.request.post(`${IDP_URL}/api/auth/sign-up/email`, {
    headers: { origin: IDP_URL },
    data: { name, email, password },
  });
  if (!response.ok()) {
    const body = await response.text();
    if (body.includes('USER_ALREADY_EXISTS') || body.includes('already exists')) {
      throw new Error(
        `${email} уже зарегистрирован в IdP: базы не чистые. Сбросьте базы справки и IdP или запустите с --shots-only`,
      );
    }
    throw new Error(`регистрация ${email} в IdP: ${response.status()} ${body.slice(0, 200)}`);
  }
  await page.goto(await waitForVerificationLink(email));

  await goto(page, '/login');
  await page.getByRole('button', { name: 'Войти через plwedding ID' }).click();
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/login') && !url.href.startsWith(IDP_URL),
    {
      timeout: 30_000,
    },
  );
  return { email, password };
}
