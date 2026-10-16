'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatFileSize } from '@/modules/tasks/client';

import { AttachmentIcon } from './attachment-icon';
import type { UploadItem } from './use-attachment-upload';

interface UploadRowProps {
  item: UploadItem;
  onCancel: (localId: string) => void;
}

/** Загружаемый файл: прогресс или ошибка; крестик — отменить или убрать строку. */
export function UploadRow({ item, onCancel }: UploadRowProps) {
  const inProgress = item.status === 'queued' || item.status === 'uploading';
  const label = inProgress ? 'Отменить загрузку' : 'Убрать';

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border border-dashed p-2">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
        <AttachmentIcon className="size-6 text-muted-foreground" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="truncate text-sm" title={item.fileName}>
          {item.fileName}
        </p>
        {item.status === 'error' ? (
          <p role="alert" className="text-xs text-destructive">
            {item.error}
          </p>
        ) : item.status === 'done' ? (
          <p className="text-xs text-muted-foreground">{formatFileSize(item.size)}</p>
        ) : (
          <Progress
            value={item.progress}
            aria-label={`Загрузка ${item.fileName}: ${item.progress}%`}
          />
        )}
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={() => onCancel(item.localId)}
        aria-label={`${label}: ${item.fileName}`}
      >
        <X />
      </Button>
    </li>
  );
}
