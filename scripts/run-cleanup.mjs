// Ручной запуск очистки на локальном dev-сервере: pnpm cleanup:run — события журнала старше
// AUDIT_RETENTION_DAYS и истёкшие счётчики лимитов. CRON_SECRET берётся из .env
// (node --env-file-if-exists), адрес — APP_URL или localhost:3000. Повторный запуск безопасен.

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('[cleanup] CRON_SECRET не задан в .env (не короче 32 символов)');
  process.exit(2);
}

const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
const response = await fetch(new URL('/api/cron/cleanup', baseUrl), {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
});
console.log(`[cleanup] ${response.status} ${await response.text()}`);
process.exit(response.ok ? 0 : 1);
