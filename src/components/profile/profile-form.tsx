'use client';

import { useActionState, useState } from 'react';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_POSITION_MAX_LENGTH,
  updateProfileAction,
} from '@/modules/profiles/client';
import type { FormState } from '@/shared/types';

interface ProfileFormProps {
  position: string;
  bio: string;
}

/** Должность и описание. */
export function ProfileForm({ position, bio }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfileAction,
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;
  const initialBio = failure?.values.bio ?? bio;
  const [bioLength, setBioLength] = useState(initialBio.length);
  const bioErrors = fieldErrors?.bio;

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <FormField
        name="position"
        label="Должность"
        autoComplete="organization-title"
        placeholder="Например, фронтенд-разработчик"
        maxLength={PROFILE_POSITION_MAX_LENGTH}
        defaultValue={failure?.values.position ?? position}
        errors={fieldErrors?.position}
      />
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="bio">Описание</Label>
          <span id="bio-counter" className="text-xs text-muted-foreground tabular-nums">
            {bioLength} / {PROFILE_BIO_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          id="bio"
          name="bio"
          rows={5}
          placeholder="Чем занимаетесь, по каким вопросам к вам обращаться"
          maxLength={PROFILE_BIO_MAX_LENGTH}
          defaultValue={initialBio}
          onChange={(event) => setBioLength(event.currentTarget.value.length)}
          aria-invalid={bioErrors ? true : undefined}
          aria-describedby={bioErrors ? 'bio-counter bio-error' : 'bio-counter'}
        />
        {bioErrors && (
          <p id="bio-error" className="text-sm text-destructive">
            {bioErrors.join(' ')}
          </p>
        )}
      </div>
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
