'use client';

import { Paperclip } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  attachmentLimit,
  formatFileSize,
  type AttachmentTarget,
} from '@/modules/tasks/client';
import { cn } from '@/lib/utils';

import { UploadRow } from './upload-row';
import { useAttachmentUpload } from './use-attachment-upload';

/** Перетаскивают ли файлы (а не текст или ссылку). */
export function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/** Состояние «над зоной перетаскивают файлы» с учётом вложенных элементов. */
export function useFileDrop(onFiles: (files: FileList) => void, enabled = true) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (!enabled || !isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver(event: DragEvent) {
      if (!enabled || !isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave(event: DragEvent) {
      if (!enabled || !isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(event: DragEvent) {
      if (!enabled || !isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
    },
  };
  return { over, handlers };
}

interface AttachmentDropzoneProps {
  workspaceId: string;
  taskId: string;
  target: AttachmentTarget;
  /** Уже прикреплённые файлы — для лимита. */
  existingCount: number;
  /** Список готовых файлов (серверный). */
  children?: ReactNode;
}

/**
 * Блок загрузки: кнопка «Прикрепить файлы», перетаскивание на весь блок, строки с прогрессом.
 * Готовый файл появляется в серверном списке (action ревалидирует страницу), строка загрузки
 * при этом убирается.
 */
export function AttachmentDropzone({
  workspaceId,
  taskId,
  target,
  existingCount,
  children,
}: AttachmentDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useAttachmentUpload({
    workspaceId,
    taskId,
    target,
    existingCount,
    onUploaded: (item) => upload.cancel(item.localId),
  });
  const limit = attachmentLimit(target);
  const full = existingCount >= limit;
  const { over, handlers } = useFileDrop((files) => upload.addFiles(files), !full);

  return (
    <div
      {...handlers}
      className={cn(
        'grid gap-3 rounded-xl border border-transparent p-1 transition-colors',
        over && 'border-primary bg-primary/5',
      )}
    >
      {children}
      {upload.items.length > 0 && (
        <ul className="grid gap-2" aria-label="Загружаемые файлы">
          {upload.items.map((item) => (
            <UploadRow key={item.localId} item={item} onCancel={upload.cancel} />
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-sm text-muted-foreground">
          Прикреплено максимальное число файлов ({limit}).
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              if (event.currentTarget.files) upload.addFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip />
            Прикрепить файлы
          </Button>
          <span className="text-xs text-muted-foreground">
            или перетащите сюда · до {formatFileSize(ATTACHMENT_MAX_SIZE)}
          </span>
        </div>
      )}
    </div>
  );
}
