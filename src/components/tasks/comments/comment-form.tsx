'use client';

import { useActionState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { createCommentAction } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { CommentBodyField } from './comment-body-field';

interface CommentFormProps {
  workspaceId: string;
  taskId: string;
}

/** Новый комментарий. После успеха React сам сбрасывает форму; при ошибке текст возвращается. */
export function CommentForm({ workspaceId, taskId }: CommentFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCommentAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-2" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="taskId" value={taskId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <CommentBodyField
        id="new-comment"
        label="Новый комментарий"
        defaultValue={failure?.values.body ?? ''}
        errors={fieldErrors?.body}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить'}
        </Button>
        <span className="text-xs text-muted-foreground">Ctrl+Enter — отправить</span>
      </div>
    </form>
  );
}
