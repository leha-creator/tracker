import { z } from 'zod';

/** Курсор страницы журнала: `<ISO-время>_<id>` последнего показанного события. */
export interface AuditCursor {
  createdAt: Date;
  id: string;
}

const auditCursorSchema = z.string().transform((value, ctx): AuditCursor => {
  const index = value.lastIndexOf('_');
  const createdAt = new Date(value.slice(0, index));
  const id = value.slice(index + 1);
  if (index <= 0 || Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    ctx.addIssue({ code: 'custom', message: 'Некорректный курсор' });
    return z.NEVER;
  }
  return { createdAt, id };
});

export function encodeAuditCursor(row: AuditCursor): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

/** Курсор из адресной строки или формы: некорректный — первая страница. */
export function parseAuditCursor(raw: unknown): AuditCursor | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const result = auditCursorSchema.safeParse(raw);
  return result.success ? result.data : null;
}
