import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { UserAvatar } from '@/components/users/user-avatar';
import type { WorkloadItem } from '@/modules/tasks/client';

import { CountBar } from './count-bar';
import { dashboardTasksHref, OPEN_CATEGORIES } from './dashboard-href';

/** Нагрузка участников: открытые (полоса и число) и просроченные — ссылки на их задачи. */
export function WorkloadTable({
  rows,
  max,
  workspaceSlug,
}: {
  rows: WorkloadItem[];
  max: number;
  workspaceSlug: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">В пространстве пока нет участников.</p>;
  }
  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">Открытые и просроченные задачи участников</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="w-[45%] pb-2 text-left font-normal">
            Участник
          </th>
          <th scope="col" className="pb-2 text-left font-normal">
            Открыто
          </th>
          <th scope="col" className="w-24 pb-2 text-right font-normal">
            Просрочено
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.userId} className="border-t">
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              <Link
                href={dashboardTasksHref(workspaceSlug, {
                  assignees: [row.userId],
                  categories: OPEN_CATEGORIES,
                })}
                className="flex min-w-0 items-center gap-2 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <UserAvatar user={{ name: row.name, image: row.image }} />
                <span className="truncate">{row.name}</span>
                {row.isAgent && <span className="shrink-0 text-muted-foreground">(агент)</span>}
              </Link>
            </th>
            <td className="py-2">
              <CountBar value={row.open} max={max} label={`${row.name}: открыто ${row.open}`} />
            </td>
            <td className="py-2 text-right tabular-nums">
              {row.overdue > 0 ? (
                <Link
                  href={dashboardTasksHref(workspaceSlug, {
                    assignees: [row.userId],
                    due: 'overdue',
                  })}
                  className="inline-flex items-center gap-1 rounded-sm font-medium text-destructive hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AlertTriangle aria-hidden className="size-3.5" />
                  {row.overdue}
                </Link>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
