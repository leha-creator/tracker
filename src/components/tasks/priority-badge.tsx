import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TASK_PRIORITY_LABELS, type TaskPriority } from '@/modules/tasks/client';

// Полные имена классов: Tailwind находит их в исходниках.
const PRIORITY_CLASSES: Record<Exclude<TaskPriority, 'none'>, string> = {
  low: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  urgent: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

/** Бейдж приоритета; «без приоритета» не показывается. */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === 'none') return null;
  return (
    <Badge variant="secondary" className={cn(PRIORITY_CLASSES[priority])}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
