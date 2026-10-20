import { PlusIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { AgentFormDialog } from '@/components/agents/agent-form-dialog';
import { AgentsTable } from '@/components/agents/agents-table';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AGENTS_PER_WORKSPACE_LIMIT, listAgents } from '@/modules/agents';
import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Агенты — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings/agents'>;

export default function WorkspaceAgentsPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <AgentsSection params={params} />
    </Suspense>
  );
}

async function AgentsSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  // Только владелец; остальным — 404.
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug, 'owner');
  const [agents, members] = await Promise.all([
    listAgents(session, workspace.id),
    listMembers(session, workspace.id),
  ]);
  const people = members
    .filter((member) => !member.isAgent)
    .map((member) => ({ userId: member.userId, name: member.name }));
  const activeCount = agents.filter((agent) => !agent.disabledAt).length;

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/w/${workspace.slug}/settings`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Настройки пространства
        </Link>
        <PageHeader title="Агенты" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <CardTitle>Агенты пространства</CardTitle>
            <CardDescription>
              Агент — отдельный участник для Claude Code, например по агенту на репозиторий. Он
              работает по своему токену и подписывает задачи, комментарии и документы своим именем.
              Уведомления агента получает ответственный. Не больше {AGENTS_PER_WORKSPACE_LIMIT}{' '}
              включённых агентов.
            </CardDescription>
          </div>
          <AgentFormDialog
            workspaceId={workspace.id}
            members={people}
            trigger={
              <Button type="button" disabled={activeCount >= AGENTS_PER_WORKSPACE_LIMIT}>
                <PlusIcon className="size-4" />
                Создать агента
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          <AgentsTable
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            agents={agents}
            members={people}
          />
        </CardContent>
      </Card>
    </div>
  );
}
