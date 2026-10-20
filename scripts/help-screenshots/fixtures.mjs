// Файлы-примеры для вложений и документов: генерируются браузером при засеве, поэтому
// в репозитории нет бинарных заглушек и чужих данных.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { STATE_DIR } from './config.mjs';

const FIXTURES = path.join(STATE_DIR, 'fixtures');

const MOCKUP_HTML = `<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif">
<div style="width:960px;height:600px;background:#f4f4f5;display:grid;grid-template-rows:64px 1fr">
  <div style="background:#18181b;color:#fff;display:flex;align-items:center;padding:0 32px;font-weight:600">Студия Север</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:48px">
    <div><div style="font-size:40px;font-weight:700;line-height:1.1">Сайты и приложения<br>для вашего бизнеса</div>
      <div style="margin-top:24px;width:180px;height:44px;border-radius:8px;background:#4f46e5"></div></div>
    <div style="border-radius:16px;background:linear-gradient(135deg,#a5b4fc,#f0abfc)"></div>
  </div>
</div></body></html>`;

const BRIEF_HTML = `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:48px">
<h1>Бриф: новый сайт студии</h1>
<p>Цель — заявки от новых клиентов. Срок запуска — конец квартала.</p>
<h2>Страницы</h2><ul><li>Главная</li><li>Услуги</li><li>Кейсы</li><li>О нас</li><li>Контакты</li></ul>
</body></html>`;

const BUDGET_CSV = `Статья;Сумма, ₽;Ответственный
Дизайн;180000;Вера Козлова
Вёрстка;240000;Борис Петров
Хостинг на год;24000;Анна Смирнова
Реклама;120000;Анна Смирнова
`;

/** Пути к готовым файлам: mockup.png, brief.pdf, budget.csv. */
export async function prepareFixtures(browser) {
  await mkdir(FIXTURES, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  try {
    await page.setContent(MOCKUP_HTML);
    await page.screenshot({ path: path.join(FIXTURES, 'mockup.png') });
    await page.setContent(BRIEF_HTML);
    await page.pdf({ path: path.join(FIXTURES, 'brief.pdf'), format: 'A4' });
  } finally {
    await page.close();
  }
  await writeFile(path.join(FIXTURES, 'budget.csv'), `﻿${BUDGET_CSV}`);
  return {
    mockup: path.join(FIXTURES, 'mockup.png'),
    brief: path.join(FIXTURES, 'brief.pdf'),
    budget: path.join(FIXTURES, 'budget.csv'),
  };
}
