'use client';

import { useRef, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { useSettingsDraft } from '@/components/forms/settings-draft';
import {
  TASK_KEY_MAX_LENGTH,
  updateTaskKeyAction,
  type FormState,
} from '@/modules/workspaces/client';
import { formValues } from '@/shared/types';

type Failure = Extract<NonNullable<FormState<{ taskKey: string }>>, { ok: false }>;

/**
 * Смена ключа задач пространства (`TSK` → TSK-42).
 * Своей кнопки нет — правки сохраняет общая панель страницы (`SettingsDraftProvider`).
 */
export function TaskKeyForm({
  workspaceId,
  taskKey,
}: {
  workspaceId: string;
  taskKey: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(taskKey);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const fieldErrors = failure?.error.fieldErrors;

  const requestSave = useSettingsDraft('task-key', dirty, {
    save: async () => {
      if (!formRef.current) return true;
      const result = await updateTaskKeyAction(null, new FormData(formRef.current));
      if (!result) return false;
      if (!result.ok) {
        setFailure(result);
        return false;
      }
      setSaved(result.data.taskKey);
      setFailure(null);
      setDirty(false);
      return true;
    },
    reset: () => {
      setFailure(null);
      setDirty(false);
      setFormKey((key) => key + 1);
    },
  });

  return (
    <form
      key={formKey}
      ref={formRef}
      onChange={(event) => {
        const value = formValues(new FormData(event.currentTarget), ['taskKey']).taskKey ?? '';
        // Поле показывает ключ заглавными (CSS), сервер приводит его так же.
        setDirty(value.trim().toUpperCase() !== (saved ?? ''));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        requestSave();
      }}
      className="grid gap-4"
      noValidate
    >
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
          defaultValue={saved ?? ''}
          errors={fieldErrors?.taskKey}
        />
        <p className="text-sm text-muted-foreground">
          {saved
            ? `Задачи называются ${saved}-1, ${saved}-2…`
            : 'Ключ не задан: задачи называются #1, #2…, привязка к GitHub не работает.'}{' '}
          После смены ключа ветки и PR со старым ключом перестанут привязываться, уже привязанные
          останутся.
        </p>
      </div>
    </form>
  );
}
