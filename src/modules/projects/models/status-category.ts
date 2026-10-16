/** Категория статуса: от неё зависят будущие фильтры «выполненные» и автоперевод задач. */
export const STATUS_CATEGORIES = ['todo', 'in_progress', 'done'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
};

export type TasksByCategory = Record<StatusCategory, number>;

/** Сумма задач по категориям статусов проекта: «К выполнению», «В работе», «Готово». */
export function countTasksByCategory(
  statuses: readonly { category: StatusCategory; tasksCount: number }[],
): TasksByCategory {
  const counts: TasksByCategory = { todo: 0, in_progress: 0, done: 0 };
  for (const { category, tasksCount } of statuses) counts[category] += tasksCount;
  return counts;
}

/** Доля выполненных задач, 0–100 (целое); без задач — null. */
export function completionPercent(counts: TasksByCategory): number | null {
  const total = counts.todo + counts.in_progress + counts.done;
  return total === 0 ? null : Math.round((counts.done / total) * 100);
}
