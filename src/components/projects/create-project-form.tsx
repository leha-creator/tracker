'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { createProjectAction, PROJECT_NAME_MAX_LENGTH } from '@/modules/projects/client';
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
