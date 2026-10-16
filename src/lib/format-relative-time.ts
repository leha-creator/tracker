const RELATIVE = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
const DATE = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

/** «5 минут назад», «вчера», дальше недели — дата. Работает и на сервере, и в браузере. */
export function formatRelativeTime(value: string | Date, now = Date.now()): string {
  const date = new Date(value);
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (Math.abs(minutes) < 1) return 'только что';
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return RELATIVE.format(days, 'day');
  return DATE.format(date);
}
