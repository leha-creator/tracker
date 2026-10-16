'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { getProjectTabs } from '@/components/layout/nav-items';
import { TabLink } from '@/components/layout/tab-link';
import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';
import { Button } from '@/components/ui/button';

interface ProjectNavProps {
  basePath: string;
  /** Список проектов пространства — первый шаг хлебных крошек. */
  projectsHref: string;
  name: string;
  description: string | null;
  canManage: boolean;
}

/** Шапка проекта: крошки, название, «Новая задача» и вкладки. «Настройки» видны только с правом управления. */
export function ProjectNav({
  basePath,
  projectsHref,
  name,
  description,
  canManage,
}: ProjectNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // «Новая задача» открывает панель создания на доске или в списке; из настроек — на доске.
  const onTaskView = pathname === basePath + '/board' || pathname === basePath + '/list';
  const newTaskHref = onTaskView
    ? taskPanelHref(pathname, searchParams.toString(), 'new')
    : taskPanelHref(basePath + '/board', '', 'new');

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <p className="text-sm text-muted-foreground">
            <Link
              href={projectsHref}
              className="rounded-sm transition-colors hover:text-foreground"
            >
              Проекты
            </Link>
            <span aria-hidden className="px-1.5 text-muted-foreground/50">
              /
            </span>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight break-words sm:truncate">{name}</h1>
          {description && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={description}>
              {description}
            </p>
          )}
        </div>
        <Button asChild size="sm">
          <Link href={newTaskHref} scroll={false}>
            Новая задача
          </Link>
        </Button>
      </div>
      <nav
        aria-label="Разделы проекта"
        className="-mx-4 no-scrollbar flex gap-5 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {getProjectTabs(basePath, canManage).map((tab) => (
          <TabLink key={tab.href} href={tab.href} active={tab.isActive(pathname)} className="h-10">
            {tab.label}
          </TabLink>
        ))}
      </nav>
    </div>
  );
}
