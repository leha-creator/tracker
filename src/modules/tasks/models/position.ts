import { generateKeyBetween } from 'fractional-indexing';

/**
 * Позиции карточек — дробные ключи (fractional-indexing): перемещение карточки меняет одну строку.
 * Ключи сравниваются побайтно (в БД колонка с COLLATE "C"), не через localeCompare.
 */

/** Ключ после последней карточки колонки (или первый ключ пустой колонки). */
export function positionAfter(last: string | null): string {
  return generateKeyBetween(last, null);
}

/** Ключ строго между соседями; null — край колонки. */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

function compareBytes(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Порядок карточек: по позиции побайтно, при равных ключах (гонка) — по id задачи. */
export function comparePositions(
  a: { position: string; taskId: string },
  b: { position: string; taskId: string },
): number {
  return compareBytes(a.position, b.position) || compareBytes(a.taskId, b.taskId);
}
