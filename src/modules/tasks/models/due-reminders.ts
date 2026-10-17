/** Вид напоминания: срок завтра или срок прошёл. Совпадает с enum TaskReminderKind в схеме. */
export const TASK_REMINDER_KINDS = ['due_soon', 'overdue'] as const;
export type TaskReminderKind = (typeof TASK_REMINDER_KINDS)[number];

/** Сколько задач обрабатывать за один запрос к БД. */
export const REMINDER_BATCH_SIZE = 200;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * «Сегодня» и «завтра» (`YYYY-MM-DD`) в часовом поясе напоминаний: срок хранится датой без
 * времени, поэтому сутки считаются по календарю пояса, а не по UTC.
 */
export function reminderDates(now: Date, timeZone: string): { today: string; tomorrow: string } {
  // en-CA форматирует дату как YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return { today, tomorrow: addDays(today, 1) };
}

/**
 * Кому напомнить: о сроке завтра — ответственному, о просрочке — ответственному и наблюдателям.
 * Агенты остаются в списке: их уведомления маршрутизирует модуль notifications.
 */
export function pickReminderRecipients(
  kind: TaskReminderKind,
  assigneeId: string | null,
  watcherIds: readonly string[],
): string[] {
  const ids = kind === 'due_soon' ? [assigneeId] : [assigneeId, ...watcherIds];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
