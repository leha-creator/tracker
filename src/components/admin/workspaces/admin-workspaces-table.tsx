import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import Link from 'next/link';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  ADMIN_WORKSPACE_SORT_LABELS,
  toggleAdminWorkspaceSort,
  type AdminWorkspaceListItemDto,
  type AdminWorkspaceListQuery,
  type AdminWorkspaceSort,
} from '@/modules/admin/client';
import { formatBytes } from '@/modules/documents/client';

import { adminWorkspacesHref } from './admin-workspaces-href';

// Таблица рендерится на сервере: даты форматируются здесь, без расхождения часовых поясов.
const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

/** Таблица пространств ресурса: владельцы, счётчики, хранилище, архив. */
export function AdminWorkspacesTable({
  items,
  query,
}: {
  items: AdminWorkspaceListItemDto[];
  query: AdminWorkspaceListQuery;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader sort="name" query={query} />
            <TableHead>Владельцы</TableHead>
            <TableHead className="text-right">Участники</TableHead>
            <TableHead className="text-right">Проекты</TableHead>
            <TableHead className="text-right">Задачи</TableHead>
            <TableHead className="text-right">Хранилище</TableHead>
            <SortHeader sort="created" query={query} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((workspace) => (
            <TableRow key={workspace.id}>
              <TableCell className="max-w-72">
                <div className="flex items-center gap-2.5">
                  <EntityIconTile icon={workspace.icon} size="sm" />
                  <div className="grid min-w-0">
                    <Link
                      href={`/admin/workspaces/${workspace.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {workspace.name}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      /{workspace.slug}
                      {workspace.taskKey ? ` · ${workspace.taskKey}` : ''}
                    </span>
                  </div>
                  {workspace.archivedAt && <Badge variant="outline">В архиве</Badge>}
                </div>
              </TableCell>
              <TableCell className="max-w-56 text-sm whitespace-normal">
                {workspace.owners.length === 0 ? (
                  <span className="text-destructive">Нет владельца</span>
                ) : (
                  workspace.owners.map((owner, index) => (
                    <span key={owner.userId}>
                      {index > 0 && ', '}
                      <Link href={`/admin/users/${owner.userId}`} className="hover:underline">
                        {owner.name}
                      </Link>
                    </span>
                  ))
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {workspace.membersCount}
                {workspace.agentsCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    +{workspace.agentsCount} аг.
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{workspace.projectsCount}</TableCell>
              <TableCell className="text-right tabular-nums">{workspace.tasksCount}</TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                {formatBytes(workspace.storage.usedBytes)}
                <span className="text-muted-foreground">
                  {' '}
                  / {formatBytes(workspace.storage.quotaBytes)}
                </span>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                <time dateTime={workspace.createdAt.toISOString()}>
                  {DATE.format(workspace.createdAt)}
                </time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortHeader({ sort, query }: { sort: AdminWorkspaceSort; query: AdminWorkspaceListQuery }) {
  const active = query.sort === sort;
  const Icon = !active ? ArrowUpDownIcon : query.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        href={adminWorkspacesHref(toggleAdminWorkspaceSort(query, sort))}
        scroll={false}
        className={cn(
          '-mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-muted',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {ADMIN_WORKSPACE_SORT_LABELS[sort]}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </Link>
    </TableHead>
  );
}
