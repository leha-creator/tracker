'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { quickCreateTaskAction, TASK_TITLE_MAX_LENGTH } from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

interface AddSubtaskFormProps {
  workspaceId: string;
  parentId: string;
  parentKey: string;
  /** Полная форма создания подзадачи (поля, проект и статус — сразу на доску). */
  fullFormHref: string;
}

/**
 * «+ Подзадача»: Enter создаёт подзадачу с названием и оставляет поле для следующей, Esc закрывает.
 * Подзадача создаётся вне проектов — на доску её выводят отдельно или через полную форму.
 */
export function AddSubtaskForm({
  workspaceId,
  parentId,
  parentKey,
  fullFormHref,
}: AddSubtaskFormProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState<{ number: number }>, FormData>(
    quickCreateTaskAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const failure = state && !state.ok ? state : null;
  const error = failure?.error.fieldErrors?.title?.join(' ') ?? failure?.error.message;
  const errorId = `add-subtask-${parentId}-error`;

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 justify-start text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Plus /> Подзадача
        </Button>
        <Link
          href={fullFormHref}
          scroll={false}
          className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Подробная форма
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-1" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="parentId" value={parentId} />
      <Input
        ref={inputRef}
        name="title"
        autoFocus
        required
        maxLength={TASK_TITLE_MAX_LENGTH}
        placeholder="Название подзадачи"
        aria-label={`Новая подзадача для ${parentKey}`}
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
        className="h-8"
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Enter — добавить, Esc — закрыть</p>
      )}
    </form>
  );
}
