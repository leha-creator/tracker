/**
 * Перенос карточки на доске — чистые функции для оптимистичного состояния клиента.
 * Колонки — карточки по id статуса в порядке отображения; функции не мутируют входные данные.
 */
export type BoardColumns<T extends { taskId: string }> = Record<string, T[]>;

/** Id статуса (колонки), в которой сейчас лежит карточка, или null. */
export function findCardColumn<T extends { taskId: string }>(
  columns: BoardColumns<T>,
  taskId: string,
): string | null {
  for (const [statusId, cards] of Object.entries(columns)) {
    if (cards.some((card) => card.taskId === taskId)) return statusId;
  }
  return null;
}

/**
 * Переносит карточку в колонку `toStatusId` на индекс `toIndex` (индекс — в колонке без
 * переносимой карточки, ограничивается её длиной). Неизвестная карточка — колонки без изменений.
 */
export function moveCard<T extends { taskId: string }>(
  columns: BoardColumns<T>,
  taskId: string,
  toStatusId: string,
  toIndex: number,
): BoardColumns<T> {
  const fromStatusId = findCardColumn(columns, taskId);
  if (fromStatusId === null) return columns;

  const source = columns[fromStatusId]!;
  const card = source.find((item) => item.taskId === taskId)!;
  const next: BoardColumns<T> = {
    ...columns,
    [fromStatusId]: source.filter((item) => item.taskId !== taskId),
  };
  const target = [...(next[toStatusId] ?? [])];
  const index = Math.min(Math.max(toIndex, 0), target.length);
  target.splice(index, 0, card);
  next[toStatusId] = target;
  return next;
}

/** Id карточки над позицией `index` колонки (якорь для сервера) или null для верха колонки. */
export function prevTaskIdAt<T extends { taskId: string }>(
  column: readonly T[],
  index: number,
): string | null {
  return index > 0 ? (column[index - 1]?.taskId ?? null) : null;
}
