import type { Metadata } from 'next';
import Link from 'next/link';

import { Suspense, type ReactNode } from 'react';

import { OverdueList } from '@/components/dashboard/overdue-list';
import { ProjectsBreakdown } from '@/components/dashboard/projects-breakdown';
import { StatTiles } from '@/components/dashboard/stat-tiles';
import { WorkloadTable } from '@/components/dashboard/workload-table';
import { LiveRefresh } from '@/components/realtime/use-live-refresh';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getWorkspaceDashboard } from '@/modules/tasks';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Обзор — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/overview'>;

export default function OverviewPage({ params }: Props) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-labelledby="overview-heading">
      <h1 id="overview-heading" className="text-2xl font-semibold tracking-tight">
        Обзор
      </h1>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewSection params={params} />
      </Suspense>
    </section>
  );
}

async function OverviewSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const dashboard = await getWorkspaceDashboard(session, workspace.id);
  const slug = workspace.slug;
  const empty = dashboard.counts.open === 0 && dashboard.counts.doneLast7 === 0;

  return (
    <>
      {/* Задачи меняются часто — обновление реже, чем в списке. */}
      <LiveRefresh tasksOnly debounceMs={2000} />
      <StatTiles counts={dashboard.counts} workspaceSlug={slug} />
      {empty ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>Открытых задач нет. Создайте задачу — здесь появятся нагрузка и сроки.</p>
          <Button asChild size="sm">
            <Link href={`/w/${slug}/tasks?task=new`} scroll={false}>
              Создать задачу
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <Block title="Нагрузка" description="Открытые задачи участников">
            <WorkloadTable rows={dashboard.workload} max={dashboard.maxBar} workspaceSlug={slug} />
          </Block>
          <Block title="Проекты" description="Открытые задачи по статусу в каждом проекте">
            <ProjectsBreakdown
              rows={dashboard.projects}
              max={dashboard.maxBar}
              workspaceSlug={slug}
            />
          </Block>
          <Block title="Просрочено" description="Самые давние сроки" className="lg:col-span-2">
            <OverdueList tasks={dashboard.overdueTasks} workspaceSlug={slug} />
          </Block>
        </div>
      )}
    </>
  );
}

function Block({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-xl border p-4',
        className,
      )}
    >
      <header>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
