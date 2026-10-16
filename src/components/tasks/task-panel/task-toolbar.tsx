'use client';

import { Link2, Maximize2, MoreHorizontal, PanelRightClose, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { deleteTaskAction } from '@/modules/tasks/client';

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
  canDelete: boolean;
  /** Сколько подзадач всех уровней удалится вместе с задачей. */
  descendantCount: number;
  /** Скрытые поля удаления: id и адрес возврата (панель закрывается на той же странице). */
  deleteFields: Record<string, string>;
}

/** Текст подтверждения удаления: с подзадачами — сколько их удалится. */
function deleteTaskDescription(descendantCount: number): string {
  const base = 'Задача исчезнет со всех досок вместе с комментариями и файлами.';
  const subtasks =
    descendantCount > 0
      ? ` Подзадачи всех уровней тоже будут удалены (всего: ${descendantCount}).`
      : '';
  return `${base}${subtasks} Действие нельзя отменить.`;
}

/** Действия открытой задачи: статус сохранения, ссылка, развернуть, меню «⋯», закрыть. */
export function TaskViewActions({
  variant,
  pageHref,
  closeHref,
  taskKey,
  canDelete,
  descendantCount,
  deleteFields,
}: TaskViewActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onOpenChange = useCallback((open: boolean) => setConfirmOpen(open), []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(pageHref, window.location.origin).toString());
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
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
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Действия с задачей ${taskKey}`}
              title="Ещё"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 />
              Удалить задачу…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <TaskCloseLink href={closeHref} variant={variant} />
      {/* Диалог вне меню: закрытие меню не должно размонтировать открытый диалог. */}
      {canDelete && confirmOpen && (
        <ConfirmActionDialog
          open
          onOpenChange={onOpenChange}
          action={deleteTaskAction}
          fields={deleteFields}
          title={`Удалить задачу ${taskKey}?`}
          description={deleteTaskDescription(descendantCount)}
          confirmLabel="Удалить"
        />
      )}
    </>
  );
}
