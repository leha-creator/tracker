'use client';

import { useRef, useState } from 'react';

import { EntityIconPicker } from '@/components/entity-icon/entity-icon-picker';
import { FormError, FormField } from '@/components/forms/form-field';
import { useSettingsDraft } from '@/components/forms/settings-draft';
import {
  renameWorkspaceAction,
  WORKSPACE_NAME_MAX_LENGTH,
  type FormState,
  type WorkspaceSummaryDto,
} from '@/modules/workspaces/client';
import { parseEntityIcon, type EntityIcon } from '@/shared/entity-icon';
import { formValues } from '@/shared/types';

type Failure = Extract<NonNullable<FormState<WorkspaceSummaryDto>>, { ok: false }>;

interface RenameWorkspaceFormProps {
  workspaceId: string;
  name: string;
  icon: EntityIcon;
}

/**
 * Название и иконка пространства: слева название, справа иконка (2 × 5).
 * Своей кнопки нет — правки сохраняет общая панель страницы (`SettingsDraftProvider`).
 */
export function RenameWorkspaceForm({ workspaceId, name, icon }: RenameWorkspaceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState({ name, icon });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [dirty, setDirty] = useState(false);
  // Новый ключ пересоздаёт поля с сохранёнными значениями («Отменить»).
  const [formKey, setFormKey] = useState(0);
  const fieldErrors = failure?.error.fieldErrors;

  const requestSave = useSettingsDraft('workspace', dirty, {
    save: async () => {
      if (!formRef.current) return true;
      const data = new FormData(formRef.current);
      const result = await renameWorkspaceAction(null, data);
      if (!result) return false;
      if (!result.ok) {
        setFailure(result);
        return false;
      }
      // DTO без иконки: сохранённой считаем отправленную (сервер её проверил).
      setSaved({
        name: result.data.name,
        icon: parseEntityIcon(formValues(data, ['icon']).icon) ?? icon,
      });
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

  function handleChange(form: HTMLFormElement) {
    const values = formValues(new FormData(form), ['name', 'icon']);
    setDirty(values.name?.trim() !== saved.name || values.icon !== saved.icon);
  }

  return (
    <form
      key={formKey}
      ref={formRef}
      onChange={(event) => handleChange(event.currentTarget)}
      onSubmit={(event) => {
        event.preventDefault();
        requestSave();
      }}
      className="grid gap-4"
      noValidate
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
        <FormField
          name="name"
          label="Название"
          required
          maxLength={WORKSPACE_NAME_MAX_LENGTH}
          defaultValue={saved.name}
          errors={fieldErrors?.name}
        />
        <EntityIconPicker
          defaultValue={saved.icon}
          gridClassName="sm:grid-cols-2"
          errors={fieldErrors?.icon}
        />
      </div>
    </form>
  );
}
