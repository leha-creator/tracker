// Скриншоты справки: засев демо-данных и съёмка экранов в public/help-media/.
//   pnpm help:screenshots                  — засев (с продолжением после сбоя) и съёмка
//   pnpm help:screenshots --shots-only     — только съёмка по уже засеянным данным
//   pnpm help:screenshots --only=board     — снять одну статью
//   pnpm help:screenshots --seed-only      — только засев
//   --allow-remote                         — разрешить нелокальный HELP_APP_URL
// Нужен отдельный сервер с чистой базой и AUTH_REQUIRE_EMAIL_VERIFICATION=false
// (HELP_APP_URL, по умолчанию http://localhost:3001 — этот порт MinIO разрешает в CORS) — см. docs/development.md.
import { BASE_URL, log } from './config.mjs';
import { launchBrowser } from './browser.mjs';
import { loadSeedState, runSeed, saveSeedState } from './seed.mjs';
import { runShots } from './shots.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];

// Засев регистрирует пользователей и создаёт пространство: на чужом сервере — только явно.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!LOCAL_HOSTS.has(new URL(BASE_URL).hostname) && !flag('allow-remote')) {
  console.error(
    `[help-screenshots] ${BASE_URL} — не локальный адрес. Скрипт создаёт демо-данные; если сервер точно тестовый, добавьте --allow-remote`,
  );
  process.exit(2);
}

const health = await fetch(new URL('/api/health', BASE_URL)).catch(() => null);
if (!health?.ok) {
  console.error(`[help-screenshots] ${BASE_URL}/api/health недоступен — запустите сервер справки`);
  process.exit(2);
}

const browser = await launchBrowser();
const startedAt = Date.now();
try {
  if (!flag('shots-only')) {
    const state = await runSeed(browser, { only: value('seed-step') });
    log(`seed: готово, шагов ${state.done.length}`);
  }
  if (!flag('seed-only')) {
    const state = await loadSeedState();
    const { count, bytes } = await runShots(browser, state, {
      article: value('only'),
      saveState: saveSeedState,
    });
    log(`снимков: ${count}, всего ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
  }
  log(`готово за ${Math.round((Date.now() - startedAt) / 1000)} с`);
} catch (error) {
  console.error(`[help-screenshots] ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
