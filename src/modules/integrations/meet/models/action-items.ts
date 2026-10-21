import { z } from 'zod';

import type { RecapSummary } from './webhook-events';

/** Поручение конспекта, как оно хранится в TaskMeetingRecap.actionItems. */
export interface StoredActionItem {
  owner: string;
  task: string;
  /** Срок `YYYY-MM-DD`; null — не указан или не разобран. */
  due: string | null;
  /** Созданная из поручения подзадача; null — ещё не создана. */
  subtaskId: string | null;
}

const storedActionItemSchema = z.object({
  owner: z.string(),
  task: z.string(),
  due: z.string().nullable(),
  subtaskId: z.string().nullable(),
});

/** Срок поручения: только настоящая календарная дата `YYYY-MM-DD` (в начале строки). */
export function parseActionItemDue(raw: string | null | undefined): string | null {
  const match = raw?.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

/** Поручения из конспекта meet для хранения: пробелы обрезаны, пустые задачи выброшены. */
export function toStoredActionItems(summary: RecapSummary): StoredActionItem[] {
  return summary.actionItems
    .map((item) => ({
      owner: item.owner.trim(),
      task: item.task.trim(),
      due: parseActionItemDue(item.due),
      subtaskId: null,
    }))
    .filter((item) => item.task.length > 0);
}

/** Поручения из БД; несогласованные данные (ручная правка) — пустой список. */
export function parseStoredActionItems(raw: unknown): StoredActionItem[] {
  const result = z.array(storedActionItemSchema).safeParse(raw);
  return result.success ? result.data : [];
}

/** Подходит ли участник как исполнитель поручения: имя совпадает без учёта регистра и пробелов. */
export function matchesOwner(owner: string, memberName: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
  const normalizedOwner = normalize(owner);
  return normalizedOwner.length > 0 && normalizedOwner === normalize(memberName);
}
