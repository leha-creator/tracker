import Link from 'next/link';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/format-relative-time';
import type { ProjectListItemDto } from '@/modules/projects';
import {
  completionPercent,
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  type StatusCategory,
  type StatusColor,
  type TasksByCategory,
} from '@/modules/projects/client';

import { StatusCount, statusFillClass } from './status-badge';

/** Цвет категории — как у колонок по умолчанию. */
const CATEGORY_COLORS: Record<StatusCategory, StatusColor> = {
  todo: 'gray',
  in_progress: 'blue',
  done: 'green',
};

/** Сегменты полосы слева направо: сделанное, в работе, остальное. */
const BAR_ORDER: readonly StatusCategory[] = ['done', 'in_progress', 'todo'];

/** Полоса прогресса из трёх сегментов и доля выполненного справа. */
function ProgressBar({ counts }: { counts: TasksByCategory }) {
  const total = counts.todo + counts.in_progress + counts.done;
  const percent = completionPercent(counts);
  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={
          percent === null ? 'Задач нет' : `Готово ${percent}%: ${counts.done} из ${total}`
        }
        className="flex h-1.5 flex-1 gap-px overflow-hidden rounded-full bg-muted"
      >
        {total > 0 &&
          BAR_ORDER.map((category) =>
            counts[category] > 0 ? (
              <span
                key={category}
                className={statusFillClass(CATEGORY_COLORS[category])}
                style={{ width: `${(counts[category] / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {percent === null ? 'нет задач' : `${percent}%`}
      </span>
    </div>
  );
}

/** Подпись и счётчик в строке сводки. */
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Карточка проекта: иконка, название и время последнего изменения; под линией — прогресс
 * и одна строка сводки: категории слева, то, что требует внимания, — у правого края
 * (только если не ноль).
 */
export function ProjectCard({ href, project }: { href: string; project: ProjectListItemDto }) {
  const { tasksByCategory: counts, overdueCount, myOpenCount } = project;
  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card className="gap-3 transition-colors hover:bg-muted/50">
        <CardHeader className="flex items-center gap-3">
          <EntityIconTile icon={project.icon} size="lg" />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle className="truncate">{project.name}</CardTitle>
              <time
                dateTime={project.lastActivityAt.toISOString()}
                title="Последнее изменение"
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatRelativeTime(project.lastActivityAt)}
              </time>
            </div>
            <CardDescription className="truncate">
              {project.description ?? 'Без описания'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2.5 border-t border-foreground/[0.06] pt-3">
          <ProgressBar counts={counts} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {STATUS_CATEGORIES.map((category) => (
                <Stat key={category} label={STATUS_CATEGORY_LABELS[category]}>
                  <StatusCount color={CATEGORY_COLORS[category]} count={counts[category]} />
                </Stat>
              ))}
            </dl>
            {(overdueCount > 0 || myOpenCount > 0) && (
              <dl className="ml-auto flex items-center gap-x-4">
                {overdueCount > 0 && (
                  <Stat label="Просрочено">
                    <StatusCount color="red" count={overdueCount} />
                  </Stat>
                )}
                {myOpenCount > 0 && (
                  <Stat label="Мои">
                    <StatusCount color="violet" count={myOpenCount} />
                  </Stat>
                )}
              </dl>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
