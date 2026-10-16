/**
 * Перестановка статуса на место другого (перетаскивание в настройках проекта).
 * Возвращает новый порядок и id статуса, после которого встал перемещённый (null — первым),
 * или null, если порядок не меняется.
 */
export function reorderStatuses<T extends { id: string }>(
  items: readonly T[],
  activeId: string,
  overId: string,
): { items: T[]; prevStatusId: string | null } | null {
  if (activeId === overId) return null;
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from === -1 || to === -1) return null;

  const next = items.filter((_, index) => index !== from);
  next.splice(to, 0, items[from]!);
  return { items: next, prevStatusId: to === 0 ? null : next[to - 1]!.id };
}
