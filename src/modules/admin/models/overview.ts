const DAY_MS = 24 * 60 * 60 * 1000;

/** Период графика регистраций в обзоре, дней (включая сегодня). */
export const SIGNUPS_PERIOD_DAYS = 30;

export interface DailyCount {
  /** День по UTC: `YYYY-MM-DD`. */
  day: string;
  count: number;
}

/** День по UTC: `2026-10-19`. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Начало периода: полночь UTC за `days - 1` дней до сегодняшнего. */
export function dailySeriesStart(now: Date, days: number): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

/**
 * Ряд по дням за `days` дней до сегодняшнего включительно: дни без записей — нулями, лишние
 * (вне периода) отбрасываются. Порядок — от старых к новым.
 */
export function fillDailySeries(
  rows: readonly DailyCount[],
  days: number,
  now: Date,
): DailyCount[] {
  const counts = new Map(rows.map((row) => [row.day, row.count]));
  const start = dailySeriesStart(now, days).getTime();
  return Array.from({ length: days }, (_, index) => {
    const day = utcDay(new Date(start + index * DAY_MS));
    return { day, count: counts.get(day) ?? 0 };
  });
}
