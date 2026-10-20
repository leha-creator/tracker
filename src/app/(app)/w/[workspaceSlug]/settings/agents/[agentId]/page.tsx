import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ActivityFeed } from '@/components/api-tokens/activity-feed';
import { ApiTokensTable } from '@/components/api-tokens/api-tokens-table';
import { CreateApiTokenDialog } from '@/components/api-tokens/create-api-token-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/users/user-avatar';
import { getAgent } from '@/modules/agents';
import { listAgentActivity, listAgentTokens, parseActivityCursor } from '@/modules/api-tokens';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { getEnv } from '@/shared/env';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Агент — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/settings/agents/[agentId]'>;

export default function AgentPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <AgentSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Ошибку «не найдено» сервиса превращаем в 404 страницы. */
function orNotFound<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
}

async function AgentSection({ params, searchParams }: Props) {
  const [{ workspaceSlug, agentId }, query] = await Promise.all([params, searchParams]);
  // Только владелец; остальным — 404.
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug, 'owner');
  const [agent, tokens, activity] = await Promise.all([
    orNotFound(getAgent(session, workspace.id, agentId)),
    orNotFound(listAgentTokens(session, workspace.id, agentId)),
    orNotFound(
      listAgentActivity(session, workspace.id, agentId, parseActivityCursor(query.cursor)),
    ),
  ]);
  const agentPath = `/w/${workspace.slug}/settings/agents/${agent.id}`;

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <Link
        href={`/w/${workspace.slug}/settings/agents`}
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← Агенты
      </Link>

      <PageHeader
        as="header"
        title={agent.name}
        leading={<UserAvatar user={agent} size="lg" />}
        titleAddon={
          <>
            <Badge variant="secondary">Агент</Badge>
            {agent.disabledAt && <Badge variant="outline">Отключён</Badge>}
          </>
        }
        description={
          <>
            {agent.description && <p className="break-words">{agent.description}</p>}
            <p>Ответственный: {agent.responsible?.name ?? 'не назначен'}</p>
          </>
        }
      />

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <CardTitle>Токены агента</CardTitle>
            <CardDescription>
              С токеном агента Claude Code работает от имени агента. Выпускайте отдельный токен на
              каждое место запуска — его можно отозвать, не трогая остальные.
            </CardDescription>
          </div>
          <CreateApiTokenDialog
            target={{
              kind: 'agent',
              workspaceId: workspace.id,
              agentId: agent.id,
              agentName: agent.name,
            }}
            baseUrl={getEnv().BETTER_AUTH_URL}
            disabled={Boolean(agent.disabledAt)}
          />
        </CardHeader>
        <CardContent>
          <ApiTokensTable
            items={tokens}
            target={{ kind: 'agent', workspaceId: workspace.id, agentId: agent.id }}
            showWorkspace={false}
          />
        </CardContent>
      </Card>

      <Card id="activity">
        <CardHeader>
          <CardTitle>Журнал действий</CardTitle>
          <CardDescription>
            Что агент изменил через MCP: задачи, статусы, комментарии, файлы и документы. Записи
            хранятся 90 дней.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityFeed
            page={activity}
            workspaceSlug={workspace.slug}
            showToken
            nextHref={(cursor) => `${agentPath}?cursor=${encodeURIComponent(cursor)}#activity`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
