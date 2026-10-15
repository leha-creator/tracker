'use client';

import { useActionState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  renameWorkspaceAction,
  WORKSPACE_NAME_MAX_LENGTH,
  type FormState,
  type WorkspaceSummaryDto,
} from '@/modules/workspaces/client';

export function RenameWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, formAction, pending] = useActionState<FormState<WorkspaceSummaryDto>, FormData>(
    renameWorkspaceAction,
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
        maxLength={WORKSPACE_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name ?? (state?.ok ? state.data.name : name)}
        errors={fieldErrors?.name}
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
