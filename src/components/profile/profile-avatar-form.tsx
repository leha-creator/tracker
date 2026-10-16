'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/users/user-avatar';
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_SIZE,
  completeAvatarUploadAction,
  isAvatarContentType,
  removeAvatarAction,
  requestAvatarUploadAction,
} from '@/modules/profiles/client';

interface ProfileAvatarFormProps {
  name: string;
  image: string | null;
}

/** Отправка файла прямо в хранилище по presigned POST. */
async function postToStorage(
  slot: { url: string; fields: Record<string, string> },
  file: File,
): Promise<void> {
  const body = new FormData();
  for (const [key, value] of Object.entries(slot.fields)) body.append(key, value);
  body.append('file', file);
  const response = await fetch(slot.url, { method: 'POST', body });
  if (!response.ok) throw new Error('Хранилище не приняло файл — попробуйте ещё раз');
}

/** Загрузка, замена и удаление фото профиля. */
export function ProfileAvatarForm({ name, image }: ProfileAvatarFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    if (!isAvatarContentType(file.type)) {
      setError('Загрузите картинку PNG, JPEG или WebP');
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      setError('Фото — не больше 2 МБ');
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    startTransition(async () => {
      try {
        const slot = await requestAvatarUploadAction({ contentType: file.type, size: file.size });
        if (!slot.ok) throw new Error(slot.error.message);
        await postToStorage(slot.data, file);
        const done = await completeAvatarUploadAction({
          uploadId: slot.data.uploadId,
          contentType: file.type,
        });
        if (!done.ok) throw new Error(done.error.message);
        // Action перерисовывает страницы (revalidatePath) — новое фото придёт с сервера.
        toast.success('Фото обновлено');
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить фото');
      } finally {
        setPreview(null);
        URL.revokeObjectURL(localUrl);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {preview ? (
        // Локальное превью (blob:) — пока файл загружается.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="size-24 rounded-full object-cover opacity-60 motion-safe:animate-pulse"
        />
      ) : (
        <UserAvatar user={{ name, image }} size="xl" />
      )}
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) upload(file);
            }}
          />
          <Button type="button" disabled={pending} onClick={() => inputRef.current?.click()}>
            {pending ? 'Загружаем…' : image ? 'Заменить фото' : 'Загрузить фото'}
          </Button>
          {image && (
            <ConfirmActionDialog
              action={async () => {
                const result = await removeAvatarAction();
                return result.ok ? result : { ...result, values: {} };
              }}
              fields={{}}
              trigger={
                <Button type="button" variant="ghost" disabled={pending}>
                  Удалить
                </Button>
              }
              title="Удалить фото?"
              description="Вместо фото будут показываться инициалы."
              confirmLabel="Удалить"
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
