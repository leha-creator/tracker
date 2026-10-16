import { z } from 'zod';

/** Записей журнала на странице. */
export const ACTIVITY_PAGE_SIZE = 50;
/** Сколько хранится журнал: старые записи удаляются по ходу записи. */
export const ACTIVITY_RETENTION_DAYS = 90;

/** Курсор страницы: `<ISO-время>_<id>` последней показанной записи. */
export const activityCursorSchema = z.string().transform((value, ctx) => {
  const index = value.lastIndexOf('_');
  const createdAt = new Date(value.slice(0, index));
  const id = value.slice(index + 1);
  if (index <= 0 || Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    ctx.addIssue({ code: 'custom', message: 'Некорректный курсор' });
    return z.NEVER;
  }
  return { createdAt, id };
});

export type ActivityCursor = z.infer<typeof activityCursorSchema>;

export function encodeActivityCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

/** Курсор из адресной строки: некорректный — первая страница. */
export function parseActivityCursor(raw: unknown): ActivityCursor | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const result = activityCursorSchema.safeParse(raw);
  return result.success ? result.data : null;
}
