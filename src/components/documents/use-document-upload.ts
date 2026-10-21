'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  cancelDocumentUploadAction,
  completeDocumentUploadAction,
  DOCUMENT_FILE_MAX_SIZE,
  findDocumentFileType,
  formatBytes,
  requestDocumentUploadAction,
  type DocumentUploadDto,
} from '@/modules/documents/client';

/** Сколько файлов загружается одновременно. */
const MAX_PARALLEL_UPLOADS = 3;

export type DocumentUploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface DocumentUploadItem {
  localId: string;
  fileName: string;
  size: number;
  status: DocumentUploadStatus;
  /** 0–100. */
  progress: number;
  error?: string;
  documentId?: string;
}

/** Предпроверка на клиенте; окончательно тип, размер и квоту проверяет сервер. */
function precheck(file: File): string | null {
  if (!findDocumentFileType(file.name)) return 'Такой тип файла нельзя загрузить';
  if (file.size === 0) return 'Пустой файл нельзя загрузить';
  if (file.size > DOCUMENT_FILE_MAX_SIZE)
    return `Файл больше ${formatBytes(DOCUMENT_FILE_MAX_SIZE)}`;
  return null;
}

/** Сообщение по XML-ответу S3 с ошибкой (MinIO локально, Yandex Object Storage в проде). */
function storageErrorMessage(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  if (code === 'EntityTooLarge' || code === 'EntityTooSmall') {
    return 'Размер файла не совпадает с заявленным';
  }
  if (status === 403) return 'Ссылка загрузки недействительна или истекла — попробуйте ещё раз';
  return 'Хранилище не приняло файл — попробуйте ещё раз';
}

class UploadAbortedError extends Error {}

/** Отправка файла прямо в хранилище по presigned POST с прогрессом. */
function postToStorage(
  slot: DocumentUploadDto,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const [name, value] of Object.entries(slot.fields)) body.append(name, value);
    // Файл — последним полем: хранилище игнорирует поля после него.
    body.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', slot.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(storageErrorMessage(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error('Не удалось связаться с хранилищем файлов'));
    xhr.onabort = () => reject(new UploadAbortedError());
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/**
 * Очередь загрузки в хранилище пространства: предпроверка → слот → POST в хранилище →
 * подтверждение. Не больше `MAX_PARALLEL_UPLOADS` файлов одновременно; после каждого файла
 * список документов обновляется.
 */
export function useDocumentUpload({
  workspaceId,
  folderId,
}: {
  workspaceId: string;
  folderId: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<DocumentUploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const started = useRef(new Set<string>());

  const patch = useCallback((localId: string, changes: Partial<DocumentUploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...changes } : item)),
    );
  }, []);

  const upload = useCallback(
    async (item: DocumentUploadItem) => {
      const file = files.current.get(item.localId);
      if (!file) return;
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      patch(item.localId, { status: 'uploading', progress: 0 });

      let documentId: string | undefined;
      try {
        const slot = await requestDocumentUploadAction({
          workspaceId,
          folderId: folderId ?? '',
          fileName: file.name,
          size: file.size,
        });
        if (!slot.ok) throw new Error(slot.error.message);
        documentId = slot.data.documentId;
        if (controller.signal.aborted) throw new UploadAbortedError();

        await postToStorage(
          slot.data,
          file,
          (progress) => patch(item.localId, { progress }),
          controller.signal,
        );

        const done = await completeDocumentUploadAction({ workspaceId, documentId });
        if (!done.ok) throw new Error(done.error.message);

        controllers.current.delete(item.localId);
        patch(item.localId, { status: 'done', progress: 100, documentId });
        router.refresh();
      } catch (error) {
        if (error instanceof UploadAbortedError) {
          // Слот уже выдан — освобождаем место в квоте сразу, а не через сутки.
          if (documentId) void cancelDocumentUploadAction({ workspaceId, documentId });
          setItems((current) => current.filter((entry) => entry.localId !== item.localId));
        } else {
          patch(item.localId, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Не удалось загрузить файл',
          });
        }
      } finally {
        files.current.delete(item.localId);
        controllers.current.delete(item.localId);
      }
    },
    [patch, workspaceId, folderId, router],
  );

  // Запускаем файлы из очереди, пока есть свободные «слоты».
  useEffect(() => {
    const active = items.filter(
      (item) =>
        item.status === 'uploading' ||
        (item.status === 'queued' && started.current.has(item.localId)),
    ).length;
    const next = items
      .filter((item) => item.status === 'queued')
      .slice(0, Math.max(0, MAX_PARALLEL_UPLOADS - active));
    for (const item of next) {
      if (started.current.has(item.localId)) continue;
      started.current.add(item.localId);
      void upload(item);
    }
  }, [items, upload]);

  const addFiles = useCallback((selected: Iterable<File>) => {
    // Копируем сразу: FileList из <input> очищается при сбросе value.
    const prepared = Array.from(selected, (file) => {
      const localId = crypto.randomUUID();
      const problem = precheck(file);
      if (!problem) files.current.set(localId, file);
      return { localId, file, problem };
    });
    setItems((current) => [
      ...current,
      ...prepared.map(({ localId, file, problem }): DocumentUploadItem => {
        const base = { localId, fileName: file.name, size: file.size, progress: 0 };
        return problem
          ? { ...base, status: 'error', error: problem }
          : { ...base, status: 'queued' };
      }),
    ]);
  }, []);

  /** Отменить загрузку или убрать строку (ошибку, готовый файл) из списка. */
  const cancel = useCallback((localId: string) => {
    const controller = controllers.current.get(localId);
    if (controller) {
      controller.abort();
      return;
    }
    files.current.delete(localId);
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) =>
      current.filter((item) => item.status === 'uploading' || item.status === 'queued'),
    );
  }, []);

  const busy = items.some((item) => item.status === 'queued' || item.status === 'uploading');
  return { items, addFiles, cancel, clearFinished, busy };
}
