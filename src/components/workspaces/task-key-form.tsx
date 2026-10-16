'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  TASK_KEY_MAX_LENGTH,
  updateTaskKeyAction,
  type FormState,
} from '@/modules/workspaces/client';

/** Смена ключа задач пространства (`TSK` → TSK-42). */
export function TaskKeyForm({
  workspaceId,
  taskKey,
}: {
  workspaceId: string;
  taskKey: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState<{ taskKey: string }>, FormData>(
    updateTaskKeyAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const current = state?.ok ? state.data.taskKey : taskKey;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <div className="grid gap-1">
        <FormField
          name="taskKey"
          label="Ключ задач"
          required
          maxLength={TASK_KEY_MAX_LENGTH}
          autoComplete="off"
          className="max-w-40 uppercase"
          defaultValue={failure?.values.taskKey ?? current ?? ''}
          errors={fieldErrors?.taskKey}
        />
        <p className="text-sm text-muted-foreground">
          {current
            ? `Задачи называются ${current}-1, ${current}-2…`
            : 'Ключ не задан: задачи называются #1, #2…, привязка к GitHub не работает.'}{' '}
          После смены ключа ветки и PR со старым ключом перестанут привязываться, уже привязанные
          останутся.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-muted-foreground">
            Сохранено
          </span>
        )}
      </div>
    </form>
  );
}
