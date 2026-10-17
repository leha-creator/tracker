import { GitPullRequest, History } from 'lucide-react';
import Link from 'next/link';

import { ViaAgentBadge } from '@/components/agents/via-agent-badge';
import { UserAvatar } from '@/components/users/user-avatar';
import { listTaskHistory, type TaskHistoryItemDto } from '@/modules/tasks';
import type { AuthSession } from '@/shared/auth';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

interface TaskHistorySectionProps {
  session: AuthSession;
  workspaceId: string;
  taskId: string;
  /** Вся история (`history=all`) — секция сразу раскрыта. */
  all: boolean;
  /** Адрес текущей страницы или панели с `history=all`. */
  showAllHref: string;
}

/**
 * История изменений задачи: свёрнутая секция с последними записями (от новых к старым).
 * Нативный `<details>` — раскрывается без клиентского кода.
 */
export async function TaskHistorySection({
  session,
  workspaceId,
  taskId,
  all,
  showAllHref,
}: TaskHistorySectionProps) {
  const history = await listTaskHistory(session, workspaceId, taskId, { all });
  if (history.total === 0) return null;
  const hidden = history.total - history.items.length;

  return (
    <section aria-labelledby="task-history-heading">
      <details open={all} className="group">
        <summary
          id="task-history-heading"
          className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-semibold [&::-webkit-details-marker]:hidden"
        >
          <History aria-hidden className="size-4 text-muted-foreground" />
          История ({history.total})
          <span
            aria-hidden
            className="text-muted-foreground transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </summary>
        <ol className="mt-3 grid gap-2.5">
          {history.items.map((item) => (
            <HistoryEntry key={item.id} item={item} />
          ))}
        </ol>
        {hidden > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href={showAllHref} scroll={false} className="underline">
              Показать всю историю ({history.total})
            </Link>
          </p>
        )}
      </details>
    </section>
  );
}

function HistoryAvatar({ item }: { item: TaskHistoryItemDto }) {
  if (item.actor) return <UserAvatar user={item.actor} size="xs" className="mt-0.5 shrink-0" />;
  return (
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted">
      {item.source === 'github' && <GitPullRequest aria-hidden className="size-3" />}
    </span>
  );
}

function authorName(item: TaskHistoryItemDto): string {
  if (item.actor) return item.actor.name;
  return item.source === 'github' ? 'GitHub' : 'Удалённый пользователь';
}

function HistoryEntry({ item }: { item: TaskHistoryItemDto }) {
  const edited = item.updatedAt.getTime() - item.createdAt.getTime() > 1000;
  return (
    <li className="flex items-start gap-2 text-sm">
      <HistoryAvatar item={item} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-muted-foreground">
          <span className="font-medium text-foreground">{authorName(item)}</span>
          {item.via && <ViaAgentBadge via={item.via} className="ml-1.5 px-1 py-0" />}
          <span aria-hidden> · </span>
          {item.text}
        </p>
        <time
          dateTime={item.updatedAt.toISOString()}
          title={edited ? `Первая правка: ${DATE_TIME.format(item.createdAt)}` : undefined}
          className="text-xs text-muted-foreground tabular-nums"
        >
          {DATE_TIME.format(item.updatedAt)}
        </time>
      </div>
    </li>
  );
}
