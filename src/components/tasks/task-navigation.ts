/** Соседняя задача в порядке страницы; null — края или задачи нет в порядке. */
export function adjacentTaskNumber(
  order: readonly number[],
  current: number,
  step: 1 | -1,
): number | null {
  const index = order.indexOf(current);
  if (index === -1) return null;
  return order[index + step] ?? null;
}
