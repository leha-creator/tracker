'use client';

import { Archive, Link2, Maximize2, MoreHorizontal, PanelRightClose, Video, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { useStartMeeting } from '@/components/meet/use-start-meeting';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { archiveTaskAction } from '@/modules/tasks/client';

import { useRunTaskAction } from './run-task-action';
import { TaskSaveIndicator } from './task-save-status';

/** Полоса над задачей: слева — ключ или заголовок режима, справа — действия. */
export function TaskToolbar({
  start,
  children,
  sticky,
}: {
  start: ReactNode;
  children: ReactNode;
  /** В панели тулбар прилипает к верху её прокрутки. */
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4',
        sticky && 'sticky top-0 z-10 bg-background/95 backdrop-blur-sm',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">{start}</div>
      <div className="flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

/** «Закрыть панель» / «Вернуться к списку» — ссылка, Esc в панели делает то же. */
export function TaskCloseLink({ href, variant }: { href: string; variant: 'panel' | 'page' }) {
  const label = variant === 'panel' ? 'Закрыть панель' : 'К списку задач';
  return (
    <Button asChild variant="ghost" size="icon-sm" aria-label={label} title={label}>
      <Link href={href} scroll={false}>
        {variant === 'panel' ? <PanelRightClose /> : <X />}
      </Link>
    </Button>
  );
}

interface TaskViewActionsProps {
  variant: 'panel' | 'page';
  /** Полноэкранная страница задачи: «Развернуть» и ссылка для копирования. */
  pageHref: string;
  closeHref: string;
  taskKey: string;
  /** Задача в архиве: действия архива — в баннере, меню «⋯» не показывается. */
  archived: boolean;
  /** Сколько подзадач всех уровней уйдёт в архив вместе с задачей. */
  descendantCount: number;
  /** Скрытые поля действий: id пространства и задачи. */
  actionFields: { workspaceId: string; taskId: string };
  /** Настроен meet: в меню есть «Начать созвон». */
  meetEnabled: boolean;
}

/** Текст подтверждения архивирования задачи с подзадачами. */
function archiveTaskDescription(descendantCount: number): string {
  return (
    `Подзадачи всех уровней тоже уйдут в архив (всего: ${descendantCount}). ` +
    'Задачи пропадут с досок и из списка; восстановить их можно в любой момент.'
  );
}

/** Действия открытой задачи: статус сохранения, ссылка, развернуть, меню «⋯», закрыть. */
export function TaskViewActions({
  variant,
  pageHref,
  closeHref,
  taskKey,
  archived,
  descendantCount,
  actionFields,
  meetEnabled,
}: TaskViewActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onOpenChange = useCallback((open: boolean) => setConfirmOpen(open), []);
  const { pending, run } = useRunTaskAction();
  const meeting = useStartMeeting(actionFields);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(pageHref, window.location.origin).toString());
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  }

  function archive() {
    // С подзадачами — подтверждение с их числом, без них действие обратимо и не спрашивает.
    if (descendantCount > 0) setConfirmOpen(true);
    else run(archiveTaskAction, actionFields, `Задача ${taskKey} в архиве`);
  }

  return (
    <>
      <span className="mr-2 max-sm:hidden">
        <TaskSaveIndicator />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Скопировать ссылку на задачу"
        title="Скопировать ссылку"
        onClick={copyLink}
      >
        <Link2 />
      </Button>
      {variant === 'panel' && (
        <Button asChild variant="ghost" size="icon-sm" aria-label="Развернуть" title="Развернуть">
          <Link href={pageHref}>
            <Maximize2 />
          </Link>
        </Button>
      )}
      {!archived && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Действия с задачей ${taskKey}`}
              title="Ещё"
              disabled={pending}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {meetEnabled && (
              <DropdownMenuItem onSelect={meeting.start} disabled={meeting.pending}>
                <Video />
                Начать созвон
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={archive}>
              <Archive />
              {descendantCount > 0 ? 'В архив…' : 'В архив'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <TaskCloseLink href={closeHref} variant={variant} />
      {/* Диалог вне меню: закрытие меню не должно размонтировать открытый диалог. */}
      {!archived && confirmOpen && (
        <ConfirmActionDialog
          open
          onOpenChange={onOpenChange}
          action={archiveTaskAction}
          fields={actionFields}
          title={`Отправить задачу ${taskKey} в архив?`}
          description={archiveTaskDescription(descendantCount)}
          confirmLabel="В архив"
          confirmVariant="default"
        />
      )}
    </>
  );
}
