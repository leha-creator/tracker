// Браузер для засева и съёмки: контекст на пользователя, снимок с проверками.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  BASE_URL,
  LOCALE,
  log,
  MAX_SHOT_BYTES,
  OUTPUT_DIR,
  STATE_DIR,
  TIMEZONE,
  VIEWPORT,
} from './config.mjs';

/** Тосты, курсор ввода и анимации не должны попадать в кадр. */
const SHOT_CSS = `
  [data-sonner-toaster] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; transition: none !important; animation-duration: 0s !important; }
`;

export async function launchBrowser() {
  return chromium.launch({ headless: process.env.HELP_HEADED !== '1' });
}

const statePath = (userKey) => path.join(STATE_DIR, `${userKey}.storage.json`);

/** Контекст пользователя; cookie берутся из .state/<user>.storage.json, если есть. */
export async function newUserContext(browser, userKey) {
  let storageState;
  try {
    storageState = JSON.parse(await readFile(statePath(userKey), 'utf8'));
  } catch {
    storageState = undefined;
  }
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: LOCALE,
    timezoneId: TIMEZONE,
    storageState,
    acceptDownloads: true,
  });
  context.setDefaultTimeout(15_000);
  return context;
}

export async function saveUserState(context, userKey) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(statePath(userKey), JSON.stringify(await context.storageState(), null, 2));
}

/** Переход без networkidle: SSE держит соединение открытым. */
export async function goto(page, url, readyLocator) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (readyLocator) await readyLocator.waitFor();
}

/**
 * Снимок в public/help-media/<article>/<name>.png. `locator` — снять только блок, `mask` —
 * закрыть секреты (токены, ключи 2FA), `fullPage` — всю страницу.
 */
export async function shoot(page, { article, name, locator, mask = [], fullPage = false }) {
  await page.addStyleTag({ content: SHOT_CSS });
  await page.evaluate(() => document.fonts.ready);
  // Фокус и наведение не должны подсвечивать случайные элементы.
  await page.mouse.move(0, 0);
  const file = path.join(OUTPUT_DIR, article, `${name}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  const options = { path: file, mask, maskColor: '#d4d4d8', animations: 'disabled', caret: 'hide' };
  if (locator) await locator.screenshot(options);
  else await page.screenshot({ ...options, fullPage });
  const { size } = await stat(file);
  const kb = Math.round(size / 1024);
  if (size > MAX_SHOT_BYTES)
    log(`WARN ${article}/${name}.png ${kb} КБ — больше лимита, проверьте кадр`);
  else log(`${article}/${name}.png ${kb} КБ`);
  return size;
}

/** Снимок экрана с ошибкой — в .state/errors/, чтобы понять, на каком шаге сломалось. */
export async function saveErrorShot(page, label) {
  if (!page || page.isClosed()) return null;
  const file = path.join(STATE_DIR, 'errors', `${label.replace(/[^\w.-]+/g, '_')}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}
