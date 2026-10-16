'use client';

import { UploadIcon, XIcon } from 'lucide-react';
import { createContext, useContext, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { DOCUMENT_ACCEPT, formatBytes } from '@/modules/documents/client';

import { useDocumentUpload, type DocumentUploadItem } from './use-document-upload';

type UploadContextValue = ReturnType<typeof useDocumentUpload> & {
  /** Открыть выбор файлов. */
  pickFiles: () => void;
  enabled: boolean;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useDocumentUploadContext(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context)
    throw new Error('useDocumentUploadContext must be used inside <DocumentUploadProvider>');
  return context;
}

/**
 * Очередь загрузки в текущую папку — общая для кнопки «Загрузить файлы» и перетаскивания.
 * Без права на документы (`enabled = false`) загрузка недоступна.
 */
export function DocumentUploadProvider({
  workspaceId,
  folderId,
  enabled,
  children,
}: {
  workspaceId: string;
  folderId: string | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const upload = useDocumentUpload({ workspaceId, folderId });
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <UploadContext value={{ ...upload, pickFiles: () => inputRef.current?.click(), enabled }}>
      {enabled && (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            if (event.target.files) upload.addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      )}
      {children}
    </UploadContext>
  );
}

/** Область списка, куда можно перетащить файлы. */
export function DocumentDropzone({ children }: { children: ReactNode }) {
  const { addFiles, enabled } = useDocumentUploadContext();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  if (!enabled) return <>{children}</>;

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      {children}
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <UploadIcon className="size-4" />
            Отпустите, чтобы загрузить в эту папку
          </p>
        </div>
      )}
    </div>
  );
}

function UploadRow({ item, onCancel }: { item: DocumentUploadItem; onCancel: () => void }) {
  const inProgress = item.status === 'queued' || item.status === 'uploading';
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg border border-dashed px-3 py-2">
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="truncate" title={item.fileName}>
            {item.fileName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatBytes(item.size)}
          </span>
        </p>
        {item.status === 'error' ? (
          <p role="alert" className="text-xs text-destructive">
            {item.error}
          </p>
        ) : item.status === 'done' ? (
          <p className="text-xs text-muted-foreground">Загружен</p>
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
        onClick={onCancel}
        aria-label={`${inProgress ? 'Отменить загрузку' : 'Убрать'}: ${item.fileName}`}
      >
        <XIcon />
      </Button>
    </li>
  );
}

/** Загружаемые файлы над списком: прогресс, ошибки, отмена. */
export function DocumentUploadQueue({ className }: { className?: string }) {
  const { items, cancel, clearFinished, busy } = useDocumentUploadContext();
  if (items.length === 0) return null;
  return (
    <section aria-label="Загрузка файлов" className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {busy ? 'Загрузка файлов…' : 'Загрузка завершена'}
        </p>
        {!busy && (
          <Button type="button" size="sm" variant="ghost" onClick={clearFinished}>
            Скрыть
          </Button>
        )}
      </div>
      <ul className="grid gap-2">
        {items.map((item) => (
          <UploadRow key={item.localId} item={item} onCancel={() => cancel(item.localId)} />
        ))}
      </ul>
    </section>
  );
}
