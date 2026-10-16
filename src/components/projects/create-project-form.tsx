'use client';

import { useActionState } from 'react';

import { EntityIconPicker } from '@/components/entity-icon/entity-icon-picker';
import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { createProjectAction, PROJECT_NAME_MAX_LENGTH } from '@/modules/projects/client';
import { parseEntityIcon } from '@/shared/entity-icon';
import type { FormState } from '@/shared/types';

import { DescriptionField } from './description-field';

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createProjectAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="name"
        label="Название"
        required
        maxLength={PROJECT_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name}
        errors={fieldErrors?.name}
      />
      <EntityIconPicker
        defaultValue={parseEntityIcon(failure?.values.icon) ?? 'rocket'}
        errors={fieldErrors?.icon}
      />
      <DescriptionField
        defaultValue={failure?.values.description}
        errors={fieldErrors?.description}
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать проект'}
      </Button>
    </form>
  );
}
