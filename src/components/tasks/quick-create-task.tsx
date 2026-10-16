'use client';

import { Plus } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { quickCreateTaskAction, TASK_TITLE_MAX_LENGTH } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

interface QuickCreateTaskProps {
  workspaceId: string;
  projectId: string;
  statusId: string;
  statusName: string;
}

/** «+ Задача» внизу колонки: Enter создаёт задачу в этом статусе, Esc закрывает поле. */
export function QuickCreateTask({
  workspaceId,
  projectId,
  statusId,
  statusName,
}: QuickCreateTaskProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState<{ number: number }>, FormData>(
    quickCreateTaskAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.title?.join(' ') ?? failure?.error.message;
  const errorId = `quick-create-${statusId}-error`;

  // После успешного создания — пустое поле для следующей задачи.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus /> Задача
      </Button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-1" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="statusId" value={statusId} />
      <Input
        ref={inputRef}
        name="title"
        autoFocus
        required
        maxLength={TASK_TITLE_MAX_LENGTH}
        placeholder="Название задачи"
        aria-label={`Новая задача в «${statusName}»`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        defaultValue={failure?.values.title}
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Esc закрывает только поле, не панель задачи.
            event.preventDefault();
            setOpen(false);
          }
        }}
        className="h-8 bg-background"
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
