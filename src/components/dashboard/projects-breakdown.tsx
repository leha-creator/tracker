import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import type { ProjectCountRow } from '@/modules/tasks/client';

import { CountBar } from './count-bar';

/** Открытые задачи по проектам (по статусу в каждом проекте) и просроченные среди них. */
export function ProjectsBreakdown({
  rows,
  max,
  workspaceSlug,
}: {
  rows: ProjectCountRow[];
  max: number;
  workspaceSlug: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Активных проектов нет.</p>;
  }
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-1" aria-label="Открытые задачи по проектам">
      {rows.map((row) => (
        <li
          key={row.projectId}
          className="grid grid-cols-[minmax(0,45%)_minmax(0,1fr)_auto] items-center gap-3 border-t py-2 text-sm first:border-t-0"
        >
          <Link
            href={`/w/${workspaceSlug}/projects/${row.projectId}/board`}
            className="truncate rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {row.name}
          </Link>
          <CountBar value={row.open} max={max} label={`${row.name}: открыто ${row.open}`} />
          <span className="w-24 text-right tabular-nums">
            {row.overdue > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle aria-hidden className="size-3.5" />
                {row.overdue}
                <span className="sr-only">просрочено</span>
              </span>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
