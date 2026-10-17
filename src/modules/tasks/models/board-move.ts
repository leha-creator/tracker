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

export type BoardFocusDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Карточка, на которую переходит фокус со стрелки: вверх и вниз — внутри колонки, влево и вправо —
 * ближайшая по индексу карточка соседней непустой колонки. `order` — id карточек по колонкам
 * слева направо. null — дальше идти некуда.
 */
export function nextBoardFocus(
  order: readonly (readonly string[])[],
  taskId: string,
  direction: BoardFocusDirection,
): string | null {
  const column = order.findIndex((cards) => cards.includes(taskId));
  if (column === -1) return null;
  const index = order[column]!.indexOf(taskId);
  if (direction === 'up') return order[column]![index - 1] ?? null;
  if (direction === 'down') return order[column]![index + 1] ?? null;

  const step = direction === 'left' ? -1 : 1;
  for (let next = column + step; next >= 0 && next < order.length; next += step) {
    const cards = order[next]!;
    if (cards.length > 0) return cards[Math.min(index, cards.length - 1)]!;
  }
  return null;
}
