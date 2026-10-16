/** Текущая связь PR с задачей (TaskPullRequest). */
export interface ExistingPullRequestLink {
  taskId: string;
  source: 'auto' | 'manual';
  dismissed: boolean;
}

/**
 * Что изменить в автосвязях PR после разбора ссылок:
 * - `add` — задачи из ссылок, у которых связи нет совсем;
 * - `remove` — автосвязи (не отвязанные вручную), чьих ссылок больше нет.
 * Ручные связи и отвязанные вручную (dismissed) автоматика не трогает: dismissed не
 * восстанавливается, даже если ссылка осталась.
 */
export function diffAutoLinks(
  current: readonly ExistingPullRequestLink[],
  referencedTaskIds: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  const known = new Set(current.map((link) => link.taskId));
  const add = [...referencedTaskIds].filter((taskId) => !known.has(taskId));
  const remove = current
    .filter(
      (link) => link.source === 'auto' && !link.dismissed && !referencedTaskIds.has(link.taskId),
    )
    .map((link) => link.taskId);
  return { add, remove };
}
