'use client';

import { Paperclip } from 'lucide-react';
import { useActionState, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  ATTACHMENT_ACCEPT,
  COMMENT_ATTACHMENTS_LIMIT,
  createCommentAction,
  deleteAttachmentAction,
} from '@/modules/tasks/client';
import { cn } from '@/lib/utils';
import type { FormState } from '@/shared/types';

import { useFileDrop } from '../attachments/attachment-dropzone';
import { UploadRow } from '../attachments/upload-row';
import { useAttachmentUpload } from '../attachments/use-attachment-upload';
import { CommentBodyField } from './comment-body-field';

interface CommentFormProps {
  workspaceId: string;
  taskId: string;
  /**
   * Форма закреплена внизу панели задачи: в покое — только поле, кнопки появляются при фокусе,
   * тексте или файлах.
   */
  docked?: boolean;
}

/**
 * Новый комментарий с файлами. Файлы загружаются сразу (черновики), при отправке привязываются к
 * комментарию. После успеха React сбрасывает поле, черновики очищаются; при ошибке всё остаётся.
 */
export function CommentForm({ workspaceId, taskId, docked = false }: CommentFormProps) {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useAttachmentUpload({ workspaceId, taskId, target: 'comment' });
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createCommentAction(prev, formData);
      if (result?.ok) upload.clear();
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const ready = upload.items.filter((item) => item.status === 'done' && item.attachmentId);
  const full =
    upload.items.filter((item) => item.status !== 'error').length >= COMMENT_ATTACHMENTS_LIMIT;
  const { over, handlers } = useFileDrop((files) => upload.addFiles(files), !full);

  /** Убрать файл из формы: загрузку — отменить, готовый черновик — удалить на сервере. */
  function removeItem(localId: string) {
    const item = upload.items.find((entry) => entry.localId === localId);
    upload.cancel(localId);
    if (item?.status !== 'done' || !item.attachmentId) return;

    const formData = new FormData();
    formData.set('workspaceId', workspaceId);
    formData.set('taskId', taskId);
    formData.set('attachmentId', item.attachmentId);
    void deleteAttachmentAction(null, formData).then((result) => {
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  // Свёрнуть кнопки, когда фокус ушёл из формы и поле пустое.
  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (form.contains(event.relatedTarget)) return;
    const body = form.elements.namedItem('body');
    if (body instanceof HTMLTextAreaElement && body.value.trim() === '') setActive(false);
  }

  const expanded = !docked || active || upload.items.length > 0;

  // Ctrl+Enter во время загрузки не должен отправить комментарий без файлов.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (upload.busy) event.preventDefault();
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onFocus={docked ? () => setActive(true) : undefined}
      onBlur={docked ? handleBlur : undefined}
      {...handlers}
      className={cn(
        'grid gap-2 rounded-xl border border-transparent transition-colors',
        over && 'border-primary bg-primary/5 p-1',
      )}
      noValidate
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      {ready.map((item) => (
        <input key={item.localId} type="hidden" name="attachmentId" value={item.attachmentId} />
      ))}
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <CommentBodyField
        id="new-comment"
        label="Новый комментарий"
        defaultValue={failure?.values.body ?? ''}
        errors={fieldErrors?.body}
        placeholder={docked ? 'Написать комментарий…' : undefined}
        rows={docked ? 1 : 3}
      />
      {upload.items.length > 0 && (
        <ul className="grid gap-2 @lg:grid-cols-2" aria-label="Файлы комментария">
          {upload.items.map((item) => (
            <UploadRow key={item.localId} item={item} onCancel={removeItem} />
          ))}
        </ul>
      )}
      <div className={cn('flex flex-wrap items-center gap-3', !expanded && 'hidden')}>
        <Button type="submit" size="sm" disabled={pending || upload.busy}>
          {pending ? 'Отправляем…' : upload.busy ? 'Загружаем файлы…' : 'Отправить'}
        </Button>
        <input
          ref={inputRef}
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
          variant="ghost"
          disabled={full}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip />
          Файлы
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl+Enter — отправить</span>
      </div>
    </form>
  );
}
