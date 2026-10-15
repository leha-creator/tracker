'use client';

import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  createWorkspaceAction,
  slugify,
  SLUG_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
  type FormState,
} from '@/modules/workspaces/client';

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createWorkspaceAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const [name, setName] = useState(failure?.values.name ?? '');
  const suggestedSlug = slugify(name);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="name"
        label="Название"
        required
        maxLength={WORKSPACE_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name}
        onChange={(event) => setName(event.target.value)}
        errors={fieldErrors?.name}
      />
      <div className="grid gap-1">
        <FormField
          name="slug"
          label="Адрес"
          placeholder={suggestedSlug || 'otdel-prodazh'}
          maxLength={SLUG_MAX_LENGTH}
          autoComplete="off"
          defaultValue={failure?.values.slug}
          errors={fieldErrors?.slug}
        />
        <p className="text-sm text-muted-foreground">
          Ссылка на пространство: /w/{suggestedSlug || '…'}. Оставьте поле пустым, чтобы адрес
          составился из названия.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать'}
      </Button>
    </form>
  );
}
