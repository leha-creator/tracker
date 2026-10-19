'use client';

import { useRef, useState } from 'react';

import { EntityIconPicker } from '@/components/entity-icon/entity-icon-picker';
import { FormError, FormField } from '@/components/forms/form-field';
import {
  PROJECT_NAME_MAX_LENGTH,
  updateProjectAction,
  type ProjectDto,
} from '@/modules/projects/client';
import { formValues, type FormState } from '@/shared/types';

import { DescriptionField } from './description-field';
import { useSettingsDraft } from '@/components/forms/settings-draft';

type Failure = Extract<NonNullable<FormState<ProjectDto>>, { ok: false }>;

function readValues(form: HTMLFormElement) {
  const values = formValues(new FormData(form), ['name', 'description', 'icon']);
  return {
    name: values.name?.trim() ?? '',
    description: values.description?.trim() ?? '',
    icon: values.icon ?? '',
  };
}

/**
 * Основные поля проекта: слева название и описание, справа иконка (2 × 5).
 * Своей кнопки нет — правки сохраняет общая панель страницы (`SettingsDraftProvider`).
 */
export function ProjectSettingsForm({ project }: { project: ProjectDto }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(project);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [dirty, setDirty] = useState(false);
  // Новый ключ пересоздаёт поля с сохранёнными значениями («Отменить»).
  const [formKey, setFormKey] = useState(0);
  const fieldErrors = failure?.error.fieldErrors;

  const requestSave = useSettingsDraft('project', dirty, {
    save: async () => {
      if (!formRef.current) return true;
      const result = await updateProjectAction(null, new FormData(formRef.current));
      if (!result) return false;
      if (!result.ok) {
        setFailure(result);
        return false;
      }
      setSaved(result.data);
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
    const values = readValues(form);
    setDirty(
      values.name !== saved.name ||
        values.description !== (saved.description ?? '') ||
        values.icon !== saved.icon,
    );
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
      <input type="hidden" name="workspaceId" value={project.workspaceId} />
      <input type="hidden" name="projectId" value={project.id} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
        <div className="grid content-start gap-4">
          <FormField
            name="name"
            label="Название"
            required
            maxLength={PROJECT_NAME_MAX_LENGTH}
            defaultValue={saved.name}
            errors={fieldErrors?.name}
          />
          <DescriptionField
            className="sm:min-h-44"
            defaultValue={saved.description ?? ''}
            errors={fieldErrors?.description}
          />
        </div>
        <EntityIconPicker
          defaultValue={saved.icon}
          gridClassName="sm:grid-cols-2"
          errors={fieldErrors?.icon}
        />
      </div>
    </form>
  );
}
