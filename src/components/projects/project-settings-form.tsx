'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  PROJECT_NAME_MAX_LENGTH,
  updateProjectAction,
  type ProjectDto,
} from '@/modules/projects/client';
import type { FormState } from '@/shared/types';

import { DescriptionField } from './description-field';

export function ProjectSettingsForm({ project }: { project: ProjectDto }) {
  const [state, formAction, pending] = useActionState<FormState<ProjectDto>, FormData>(
    updateProjectAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const current = state?.ok ? state.data : project;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="workspaceId" value={project.workspaceId} />
      <input type="hidden" name="projectId" value={project.id} />
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="name"
        label="Название"
        required
        maxLength={PROJECT_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name ?? current.name}
        errors={fieldErrors?.name}
      />
      <DescriptionField
        defaultValue={failure?.values.description ?? current.description ?? ''}
        errors={fieldErrors?.description}
      />
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
