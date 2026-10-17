// Ручной запуск напоминаний о сроке на локальном dev-сервере: pnpm reminders:run.
// CRON_SECRET берётся из .env (node --env-file-if-exists), адрес — APP_URL или localhost:3000.
// Повторный запуск в тот же день ничего не шлёт: уже отправленные напоминания отмечены в БД.

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('[reminders] CRON_SECRET не задан в .env (не короче 32 символов)');
  process.exit(2);
}

const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
const response = await fetch(new URL('/api/cron/reminders', baseUrl), {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
});
console.log(`[reminders] ${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
