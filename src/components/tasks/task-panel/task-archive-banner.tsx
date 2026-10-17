'use client';

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { deleteTaskAction, restoreTaskAction } from '@/modules/tasks/client';

import { RunTaskActionButton } from './run-task-action';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

/** Текст подтверждения удаления навсегда: с подзадачами — сколько их удалится. */
function deleteTaskDescription(descendantCount: number): string {
  const base = 'Задача исчезнет навсегда вместе с комментариями и файлами.';
  const subtasks =
    descendantCount > 0
      ? ` Подзадачи всех уровней тоже будут удалены (всего: ${descendantCount}).`
      : '';
  return `${base}${subtasks} Действие нельзя отменить.`;
}

/**
 * Баннер архивной задачи: когда и кем отправлена в архив, «Восстановить» и «Удалить навсегда».
 * Поля под ним — только для чтения.
 */
export function TaskArchiveBanner({
  taskKey,
  archivedAt,
  archivedByName,
  canDeletePermanently,
  descendantCount,
  fields,
}: {
  taskKey: string;
  archivedAt: Date;
  archivedByName: string | null;
  canDeletePermanently: boolean;
  descendantCount: number;
  /** Скрытые поля действий: id пространства и задачи, адрес возврата после удаления. */
  fields: Record<string, string>;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/60 px-4 py-2.5 text-sm sm:px-6"
    >
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-muted-foreground">
        <Archive className="size-4 shrink-0" aria-hidden />
        <span>
          В архиве с {DATE_TIME.format(archivedAt)}
          {archivedByName && ` · ${archivedByName}`}. Изменения недоступны.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <RunTaskActionButton
          action={restoreTaskAction}
          fields={fields}
          successMessage={`Задача ${taskKey} восстановлена`}
          variant="outline"
          size="sm"
        >
          <ArchiveRestore />
          Восстановить
        </RunTaskActionButton>
        {canDeletePermanently && (
          <ConfirmActionDialog
            action={deleteTaskAction}
            fields={fields}
            title={`Удалить задачу ${taskKey} навсегда?`}
            description={deleteTaskDescription(descendantCount)}
            confirmLabel="Удалить навсегда"
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-destructive">
                <Trash2 />
                Удалить навсегда…
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
