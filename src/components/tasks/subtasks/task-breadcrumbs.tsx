import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { TaskAncestorDto } from '@/modules/tasks';

interface TaskBreadcrumbsProps {
  /** Предки от корня к родителю. */
  ancestors: TaskAncestorDto[];
  taskHref: (number: number) => string;
}

/**
 * Цепочка родительских задач над названием. В узкой панели — только ближайший родитель
 * (остальные свёрнуты в «…»), в широкой — вся цепочка.
 */
export function TaskBreadcrumbs({ ancestors, taskHref }: TaskBreadcrumbsProps) {
  if (ancestors.length === 0) return null;
  const lastIndex = ancestors.length - 1;
  return (
    <nav aria-label="Родительские задачи">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
        {lastIndex > 0 && (
          <li aria-hidden className="flex items-center gap-1 @md:hidden">
            …
            <ChevronRight className="size-3.5" />
          </li>
        )}
        {ancestors.map((ancestor, index) => (
          <li
            key={ancestor.number}
            className={
              index === lastIndex
                ? 'flex min-w-0 items-center gap-1'
                : 'hidden min-w-0 items-center gap-1 @md:flex'
            }
          >
            <Link
              href={taskHref(ancestor.number)}
              scroll={false}
              title={ancestor.title}
              className="flex min-w-0 items-baseline gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="shrink-0 font-mono text-xs tabular-nums">{ancestor.key}</span>
              <span className="max-w-48 truncate">{ancestor.title}</span>
            </Link>
            {index < lastIndex && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
