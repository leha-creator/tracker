import type { TaskPriority } from '@/modules/tasks/client';

/** Число закрашенных делений индикатора (из трёх). */
export function priorityLevel(priority: TaskPriority): number {
  switch (priority) {
    case 'none':
      return 0;
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
    case 'urgent':
      return 3;
  }
}

/** Выделяются цветом и подписью только «Высокий» и «Срочный» — остальные не спорят за внимание. */
export function isPriorityProminent(priority: TaskPriority): boolean {
  return priority === 'high' || priority === 'urgent';
}
