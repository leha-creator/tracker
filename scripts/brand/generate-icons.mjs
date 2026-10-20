// Генерация растровых иконок и картинок бренда из public/brand/logo-mark.svg (pnpm brand:icons).
// Рендерит Playwright (chromium), ICO собирает packIco. Результаты коммитятся в репозиторий.
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { packIco } from './ico.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SOURCE = 'public/brand/logo-mark.svg';
const DESCRIPTION = 'Простой таск-трекер с рабочими пространствами и канбан-доской';
// HEX-копии токенов (src/components/design-system/token-catalog.ts, STATIC_HEX).
const COLORS = { background: '#f9fafc', foreground: '#15181f', muted: '#5f636d' };
const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&display=block">';
const FONT_STACK = "Geist, 'Segoe UI', system-ui, sans-serif";

const log = (...parts) => console.log('[brand-icons]', ...parts);

let step = 'чтение исходника';
let target = SOURCE;

try {
  const mark = (await readFile(root + SOURCE, 'utf8')).trim();
  log('исходник', SOURCE);
  // Для иконок на всю площадь (apple-icon, maskable) платформа сама скругляет углы.
  const fullBleed = mark.replace('rx="9"', 'rx="0"');

  step = 'запуск chromium';
  const browser = await chromium.launch();
  const page = await browser.newPage();

  /** Рендер HTML в PNG заданного размера. */
  async function render(html, width, height, { transparent = false } = {}) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>
        html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}
        svg.fill{display:block;width:100%;height:100%}
      </style></head><body>${html}</body></html>`,
      { waitUntil: 'networkidle' },
    );
    await page.evaluate(() => document.fonts.ready);
    return page.screenshot({ omitBackground: transparent, type: 'png' });
  }

  const asFill = (svg) => svg.replace('<svg ', '<svg class="fill" ');

  async function write(path, data) {
    target = path;
    await writeFile(root + path, data);
    const { size } = await stat(root + path);
    log('создан', path, `${size} B`);
  }

  step = 'фавикон';
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, data: await render(asFill(mark), size, size, { transparent: true }) });
  }
  await write('src/app/favicon.ico', packIco(icoImages));

  step = 'иконки приложения';
  await write('src/app/apple-icon.png', await render(asFill(fullBleed), 180, 180));
  await write('public/brand/icon-192.png', await render(asFill(fullBleed), 192, 192));
  await write('public/brand/icon-512.png', await render(asFill(fullBleed), 512, 512));

  step = 'логотип для писем';
  const wordmark = (markSize, fontSize) => `
    <div style="display:flex;align-items:center;gap:${markSize / 4}px;font-family:${FONT_STACK}">
      <div style="width:${markSize}px;height:${markSize}px">${asFill(mark)}</div>
      <span style="font-weight:600;font-size:${fontSize}px;letter-spacing:-0.02em;color:${COLORS.foreground}">Tasker</span>
    </div>`;
  // Вдвое крупнее, чем показывается в письме (120×32): чётко на экранах высокой плотности.
  await write(
    'public/brand/logo-mail.png',
    await render(wordmark(64, 46), 240, 64, { transparent: true }),
  );

  step = 'картинка для превью ссылок';
  await write(
    'public/brand/og.png',
    await render(
      `<div style="box-sizing:border-box;width:1200px;height:630px;padding:96px;background:${COLORS.background};
          display:flex;flex-direction:column;justify-content:center;gap:40px;font-family:${FONT_STACK}">
        ${wordmark(96, 72)}
        <p style="margin:0;max-width:820px;font-size:36px;line-height:1.35;color:${COLORS.muted}">${DESCRIPTION}</p>
      </div>`,
      1200,
      630,
    ),
  );

  await browser.close();
  log('готово');
} catch (error) {
  console.error('[brand-icons] ошибка на шаге', `«${step}»`, target, error);
  process.exit(1);
}
