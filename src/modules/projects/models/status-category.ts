/** Категория статуса: от неё зависят будущие фильтры «выполненные» и автоперевод задач. */
export const STATUS_CATEGORIES = ['todo', 'in_progress', 'done'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово',
};
