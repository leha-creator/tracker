'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ATTACHMENT_MAX_SIZE,
  attachmentLimit,
  completeAttachmentUploadAction,
  findAttachmentType,
  formatFileSize,
  requestAttachmentUploadAction,
  type AttachmentTarget,
  type AttachmentUploadDto,
} from '@/modules/tasks/client';

/** Сколько файлов загружается одновременно. */
const MAX_PARALLEL_UPLOADS = 3;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  /** Локальный id строки (до ответа сервера `attachmentId` нет). */
  localId: string;
  fileName: string;
  size: number;
  status: UploadStatus;
  /** 0–100. */
  progress: number;
  error?: string;
  attachmentId?: string;
}

interface UseAttachmentUploadOptions {
  workspaceId: string;
  taskId: string;
  target: AttachmentTarget;
  /** Уже прикреплённые файлы — занимают лимит. */
  existingCount?: number;
  /** Файл загружен и подтверждён. */
  onUploaded?: (item: UploadItem) => void;
}

/** Предпроверка на клиенте; окончательно тип, размер и лимит проверяет сервер. */
function precheck(file: File): string | null {
  if (!findAttachmentType(file.name)) return 'Такой тип файла нельзя прикрепить';
  if (file.size === 0) return 'Пустой файл нельзя прикрепить';
  if (file.size > ATTACHMENT_MAX_SIZE) return `Файл больше ${formatFileSize(ATTACHMENT_MAX_SIZE)}`;
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
  slot: AttachmentUploadDto,
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
 * Очередь загрузки вложений: предпроверка → слот на сервере → POST в хранилище → подтверждение.
 * Не больше `MAX_PARALLEL_UPLOADS` файлов одновременно; отмена — `cancel(localId)`.
 */
export function useAttachmentUpload({
  workspaceId,
  taskId,
  target,
  existingCount = 0,
  onUploaded,
}: UseAttachmentUploadOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  /** Уже запущенные строки: эффект очереди может сработать до обновления статуса. */
  const started = useRef(new Set<string>());
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const patch = useCallback((localId: string, changes: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...changes } : item)),
    );
  }, []);

  const upload = useCallback(
    async (item: UploadItem) => {
      const file = files.current.get(item.localId);
      if (!file) return;
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      patch(item.localId, { status: 'uploading', progress: 0 });

      try {
        const slot = await requestAttachmentUploadAction({
          workspaceId,
          taskId,
          target,
          fileName: file.name,
          size: file.size,
        });
        if (!slot.ok) throw new Error(slot.error.message);
        if (controller.signal.aborted) throw new UploadAbortedError();

        await postToStorage(
          slot.data,
          file,
          (progress) => patch(item.localId, { progress }),
          controller.signal,
        );

        const done = await completeAttachmentUploadAction({
          workspaceId,
          taskId,
          attachmentId: slot.data.attachmentId,
        });
        if (!done.ok) throw new Error(done.error.message);

        const uploaded: UploadItem = {
          ...item,
          status: 'done',
          progress: 100,
          attachmentId: slot.data.attachmentId,
        };
        // Загрузка завершена: отменять больше нечего — `cancel` из колбэка уберёт строку.
        controllers.current.delete(item.localId);
        patch(item.localId, uploaded);
        onUploadedRef.current?.(uploaded);
      } catch (error) {
        // Отменённая загрузка просто исчезает; брошенный слот удалит ленивая очистка на сервере.
        if (error instanceof UploadAbortedError) {
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
    [patch, workspaceId, taskId, target],
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

  const addFiles = useCallback(
    (selected: Iterable<File>) => {
      const limit = attachmentLimit(target);
      // Копируем сразу: FileList из <input> очищается при сбросе value, а updater ниже
      // React может вызвать позже (и в StrictMode — дважды), поэтому в нём нет побочных эффектов.
      const prepared = Array.from(selected, (file) => {
        const localId = crypto.randomUUID();
        const problem = precheck(file);
        if (!problem) files.current.set(localId, file);
        return { localId, file, problem };
      });
      setItems((current) => {
        let taken = existingCount + current.filter((item) => item.status !== 'error').length;
        const added = prepared.map(({ localId, file, problem }): UploadItem => {
          const base = { localId, fileName: file.name, size: file.size, progress: 0 };
          const error = problem ?? (taken >= limit ? `Не больше ${limit} файлов` : null);
          if (error) return { ...base, status: 'error', error };
          taken += 1;
          return { ...base, status: 'queued' };
        });
        return [...current, ...added];
      });
    },
    [existingCount, target],
  );

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

  const clear = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading'));
  }, []);

  const busy = items.some((item) => item.status === 'queued' || item.status === 'uploading');
  return { items, addFiles, cancel, clear, busy };
}
