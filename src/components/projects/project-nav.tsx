'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { getProjectTabs } from '@/components/layout/nav-items';
import { PageHeader } from '@/components/layout/page-header';
import { TabLink } from '@/components/layout/tab-link';
import { taskPanelHref } from '@/components/tasks/task-panel/task-panel-href';
import { Button } from '@/components/ui/button';
import type { EntityIcon } from '@/shared/entity-icon';

interface ProjectNavProps {
  basePath: string;
  /** Список проектов пространства — первый шаг хлебных крошек. */
  projectsHref: string;
  name: string;
  icon: EntityIcon;
  description: string | null;
  canManage: boolean;
  /** Проект в архиве: задачи в него не создаются — без «Новой задачи». */
  archived?: boolean;
}

/** Шапка проекта: крошки, название, «Новая задача» и вкладки. «Настройки» видны только с правом управления. */
export function ProjectNav({
  basePath,
  projectsHref,
  name,
  icon,
  description,
  canManage,
  archived = false,
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
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          <Link href={projectsHref} className="rounded-sm transition-colors hover:text-foreground">
            Проекты
          </Link>
          <span aria-hidden className="px-1.5 text-muted-foreground/50">
            /
          </span>
        </p>
        <PageHeader
          title={name}
          overflow="wrap-mobile-truncate"
          leading={<EntityIconTile icon={icon} />}
          description={
            description && (
              <p className="truncate" title={description}>
                {description}
              </p>
            )
          }
          actions={
            !archived && (
              <Button asChild size="sm">
                <Link href={newTaskHref} scroll={false}>
                  Новая задача
                </Link>
              </Button>
            )
          }
        />
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
