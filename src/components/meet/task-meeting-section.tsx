import { ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/feedback/empty-state';
import { ToneBadge } from '@/components/feedback/tone-badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/users/user-avatar';
import { isMeetEnabled, listTaskMeetings } from '@/modules/integrations/meet';
import type { AuthSession } from '@/shared/auth';

import { ActionItemsDialog } from './action-items-dialog';
import { StartMeetingButton } from './start-meeting-button';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

interface TaskMeetingSectionProps {
  session: AuthSession;
  workspace: { id: string; slug: string };
  taskId: string;
  /** Задача в архиве: созвон не начать, поручения не превратить в подзадачи. */
  archived: boolean;
  members: { userId: string; name: string }[];
  /** Адрес подзадачи: в той же панели или на странице. */
  taskHref: (number: number) => string;
}

/**
 * Раздел «Созвоны» задачи (docs/meet.md): начать созвон в meet, присоединиться к идущему,
 * конспекты в документах и поручения → подзадачи. Без настроенного meet раздела нет.
 */
export async function TaskMeetingSection({
  session,
  workspace,
  taskId,
  archived,
  members,
  taskHref,
}: TaskMeetingSectionProps) {
  if (!isMeetEnabled()) return null;
  const meetings = await listTaskMeetings(session, { workspaceId: workspace.id, taskId });

  return (
    <section aria-labelledby="task-meetings-heading" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="task-meetings-heading" className="text-sm font-semibold">
          Созвоны{meetings.length > 0 && ` (${meetings.length})`}
        </h3>
        {!archived && <StartMeetingButton workspaceId={workspace.id} taskId={taskId} />}
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          variant="compact"
          className="py-4"
          title="Созвонов по задаче ещё не было"
          description="Конспект встречи сохранится в документы пространства и привяжется к задаче."
        />
      ) : (
        <ul className="grid gap-2" aria-label="Созвоны по задаче">
          {meetings.map((meeting) => {
            const live = meeting.endedAt === null;
            return (
              <li key={meeting.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {meeting.host && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <UserAvatar user={meeting.host} />
                      <span className="truncate">{meeting.host.name}</span>
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {DATE_TIME.format(meeting.startedAt)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{meeting.code}</span>
                  {live ? (
                    <ToneBadge tone="success" dot>
                      Идёт
                    </ToneBadge>
                  ) : (
                    <ToneBadge tone="neutral">Завершён</ToneBadge>
                  )}
                  {live && (
                    <Button asChild size="sm" variant="outline" className="ml-auto">
                      <a href={meeting.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                        Присоединиться
                      </a>
                    </Button>
                  )}
                </div>

                {meeting.recaps.map((recap) => (
                  <div
                    key={recap.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2"
                  >
                    {recap.document ? (
                      <Link
                        href={`/w/${workspace.slug}/docs/${recap.document.id}`}
                        className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
                      >
                        <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{recap.document.title}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Заметку с конспектом удалили</span>
                    )}
                    {recap.actionItems.length > 0 && (
                      <span className="ml-auto">
                        <ActionItemsDialog
                          workspaceId={workspace.id}
                          recapId={recap.id}
                          items={recap.actionItems.map((item) => ({
                            ...item,
                            subtaskHref: item.subtask ? taskHref(item.subtask.number) : null,
                          }))}
                          members={members}
                          disabled={archived}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
