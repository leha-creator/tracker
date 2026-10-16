'use client';

import { Trash2 } from 'lucide-react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import {
  deleteAttachmentAction,
  formatFileSize,
  type TaskAttachmentDto,
} from '@/modules/tasks/client';

import { AttachmentIcon } from './attachment-icon';

export interface AttachmentItemProps {
  workspaceId: string;
  taskId: string;
  attachment: Omit<TaskAttachmentDto, 'createdAt'>;
  /** Подпись под именем (загрузивший, дата) — форматируется на сервере. */
  meta?: string;
  /** Показывать кнопку удаления (при `canDelete`). */
  deletable?: boolean;
}

/** Файл: миниатюра или иконка, имя-ссылка, размер, удаление с подтверждением. */
export function AttachmentItem({
  workspaceId,
  taskId,
  attachment,
  meta,
  deletable = true,
}: AttachmentItemProps) {
  // Картинку открываем в новой вкладке, остальное скачивается (Content-Disposition: attachment).
  const isImage = attachment.previewHref !== null;
  const href = attachment.previewHref ?? attachment.href;
  const linkProps = isImage ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border p-2">
      <a
        href={href}
        {...linkProps}
        tabIndex={-1}
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
      >
        {attachment.previewHref ? (
          // Короткоживущая ссылка хранилища за редиректом — next/image её не оптимизирует.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.previewHref}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <AttachmentIcon kind={attachment.kind} className="size-6 text-muted-foreground" />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a
          href={href}
          {...linkProps}
          className="block truncate text-sm font-medium hover:underline"
          title={attachment.fileName}
        >
          {attachment.fileName}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {formatFileSize(attachment.size)}
          {meta && ` · ${meta}`}
        </p>
      </div>
      {deletable && attachment.canDelete && (
        <ConfirmActionDialog
          action={deleteAttachmentAction}
          fields={{ workspaceId, taskId, attachmentId: attachment.id }}
          trigger={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Удалить файл ${attachment.fileName}`}
            >
              <Trash2 />
            </Button>
          }
          title="Удалить файл?"
          description={`«${attachment.fileName}» исчезнет для всех участников. Действие нельзя отменить.`}
          confirmLabel="Удалить"
        />
      )}
    </li>
  );
}
