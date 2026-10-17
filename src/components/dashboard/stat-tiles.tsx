import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, UserX } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';
import type { DashboardCounts } from '@/modules/tasks/client';

import { dashboardTasksHref, OPEN_CATEGORIES } from './dashboard-href';

interface Tile {
  key: keyof DashboardCounts;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  href: string;
  /** Тревожное значение (просрочка) — цветом и иконкой, только если оно не ноль. */
  alert?: boolean;
}

/** Счётчики обзора: каждое число — ссылка на список задач с тем же фильтром. */
export function StatTiles({
  counts,
  workspaceSlug,
}: {
  counts: DashboardCounts;
  workspaceSlug: string;
}) {
  const tiles: Tile[] = [
    {
      key: 'open',
      label: 'Открыто',
      hint: 'Не выполнены хотя бы в одном проекте',
      icon: CircleDot,
      href: dashboardTasksHref(workspaceSlug, { categories: OPEN_CATEGORIES }),
    },
    {
      key: 'overdue',
      label: 'Просрочено',
      hint: 'Срок прошёл, задача не выполнена',
      icon: AlertTriangle,
      href: dashboardTasksHref(workspaceSlug, { due: 'overdue' }),
      alert: true,
    },
    {
      key: 'dueWeek',
      label: 'Срок на неделе',
      hint: 'Сегодня и следующие 6 дней',
      icon: CalendarClock,
      href: dashboardTasksHref(workspaceSlug, { due: 'week', categories: OPEN_CATEGORIES }),
    },
    {
      key: 'unassigned',
      label: 'Без ответственного',
      hint: 'Открытые задачи, которые никто не взял',
      icon: UserX,
      href: dashboardTasksHref(workspaceSlug, {
        assignees: ['none'],
        categories: OPEN_CATEGORIES,
      }),
    },
    {
      key: 'doneLast7',
      label: 'Закрыто за 7 дней',
      hint: 'Переведены в «Готово» за неделю',
      icon: CheckCircle2,
      href: dashboardTasksHref(workspaceSlug, { categories: ['done'] }),
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Сводка задач">
      {tiles.map((tile) => {
        const value = counts[tile.key];
        const alarming = tile.alert && value > 0;
        return (
          <li key={tile.key} className="min-w-0">
            <Link
              href={tile.href}
              title={tile.hint}
              className="grid h-full grid-cols-[minmax(0,1fr)] content-between gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex items-start gap-1.5 text-sm leading-5 text-muted-foreground">
                <tile.icon
                  aria-hidden
                  className={cn('mt-0.5 size-4 shrink-0', alarming && 'text-destructive')}
                />
                <span className="min-w-0">{tile.label}</span>
              </span>
              <span
                className={cn(
                  'text-3xl font-semibold tracking-tight tabular-nums',
                  alarming && 'text-destructive',
                )}
              >
                {value}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
