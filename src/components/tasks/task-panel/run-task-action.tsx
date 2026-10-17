'use client';

import { useTransition, type ComponentProps, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { FormState } from '@/shared/types';

type TaskFormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Собирает FormData из скрытых полей и вызывает действие; ошибка — тостом. */
export function useRunTaskAction() {
  const [pending, startTransition] = useTransition();

  function run(action: TaskFormAction, fields: Record<string, string>, successMessage?: string) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) formData.set(name, value);
    startTransition(async () => {
      const result = await action(null, formData);
      if (result && !result.ok) toast.error(result.error.message);
      else if (successMessage) toast.success(successMessage);
    });
  }

  return { pending, run };
}

/** Кнопка обратимого действия над задачей (в архив, восстановить) — без подтверждения. */
export function RunTaskActionButton({
  action,
  fields,
  successMessage,
  children,
  ...buttonProps
}: {
  action: TaskFormAction;
  fields: Record<string, string>;
  successMessage?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'type' | 'children'>) {
  const { pending, run } = useRunTaskAction();
  return (
    <Button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => run(action, fields, successMessage)}
      {...buttonProps}
    >
      {children}
    </Button>
  );
}
