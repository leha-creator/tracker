'use client';

import Link from 'next/link';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserAvatar } from '@/components/users/user-avatar';
import { disableAgentAction, enableAgentAction, type AgentDto } from '@/modules/agents/client';

import { AgentFormDialog, type ResponsibleOption } from './agent-form-dialog';

interface AgentsTableProps {
  workspaceId: string;
  workspaceSlug: string;
  agents: AgentDto[];
  members: ResponsibleOption[];
}

function permissionsLabel(agent: AgentDto): string {
  const granted = [
    agent.canManageProjects && 'проекты',
    agent.canManageDocuments && 'документы',
  ].filter(Boolean);
  return granted.length > 0 ? `Управляет: ${granted.join(', ')}` : 'Без дополнительных прав';
}

/** Агенты пространства: правка, отключение и включение (только владелец; сервер проверяет сам). */
export function AgentsTable({ workspaceId, workspaceSlug, agents, members }: AgentsTableProps) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Агентов пока нет. Создайте агента для репозитория, чтобы Claude Code работал с задачами от
        своего имени.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Агент</TableHead>
          <TableHead className="w-40">Ответственный</TableHead>
          <TableHead className="w-48 text-right">
            <span className="sr-only">Действия</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow key={agent.id} className={agent.disabledAt ? 'opacity-70' : undefined}>
            <TableCell className="whitespace-normal">
              <div className="flex items-start gap-3">
                <UserAvatar user={agent} size="sm" />
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/w/${workspaceSlug}/settings/agents/${agent.id}`}
                      className="font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {agent.name}
                    </Link>
                    {agent.disabledAt && <Badge variant="outline">Отключён</Badge>}
                  </div>
                  {agent.description && (
                    <p className="text-sm break-words text-muted-foreground">{agent.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{permissionsLabel(agent)}</p>
                </div>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              {agent.responsible?.name ?? (
                <span className="text-muted-foreground">Не назначен</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <AgentFormDialog
                  workspaceId={workspaceId}
                  members={members}
                  agent={agent}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Изменить
                    </Button>
                  }
                />
                {agent.disabledAt ? (
                  <ConfirmActionDialog
                    action={enableAgentAction}
                    fields={{ workspaceId, agentId: agent.id }}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Включить
                      </Button>
                    }
                    title={`Включить ${agent.name}?`}
                    description="Агент снова станет участником пространства без дополнительных прав. Токены нужно выпустить заново."
                    confirmLabel="Включить"
                    confirmVariant="default"
                  />
                ) : (
                  <ConfirmActionDialog
                    action={disableAgentAction}
                    fields={{ workspaceId, agentId: agent.id }}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Отключить
                      </Button>
                    }
                    title={`Отключить ${agent.name}?`}
                    description="Все токены агента будут отозваны, он перестанет быть участником и с него снимутся задачи. Созданные им задачи, комментарии и документы останутся."
                    confirmLabel="Отключить"
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
