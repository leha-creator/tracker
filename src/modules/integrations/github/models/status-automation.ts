/** Категория статуса проекта (StatusCategory в схеме). */
export type StatusCategory = 'todo' | 'in_progress' | 'done';

/** Ранг категории: автоматизация двигает задачу только вперёд. */
const CATEGORY_RANK: Record<StatusCategory, number> = { todo: 0, in_progress: 1, done: 2 };

/**
 * Менять ли статус размещения по событию PR: целевой статус другой и его категория строго
 * «дальше» текущей. Слитый PR не откатывает «Готово», повторное открытие не возвращает назад.
 */
export function shouldAutomate(input: {
  currentStatusId: string;
  currentCategory: StatusCategory;
  targetStatusId: string;
  targetCategory: StatusCategory;
}): boolean {
  if (input.currentStatusId === input.targetStatusId) return false;
  return CATEGORY_RANK[input.targetCategory] > CATEGORY_RANK[input.currentCategory];
}
