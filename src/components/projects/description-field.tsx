import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_DESCRIPTION_MAX_LENGTH } from '@/modules/projects/client';

/** Описание проекта (необязательное) с ошибками с сервера. */
export function DescriptionField({
  defaultValue,
  errors,
}: {
  defaultValue?: string;
  errors?: string[];
}) {
  const hasErrors = Boolean(errors?.length);
  return (
    <div className="grid gap-2">
      <Label htmlFor="description">Описание</Label>
      <Textarea
        id="description"
        name="description"
        rows={3}
        maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
        defaultValue={defaultValue}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? 'description-error' : undefined}
      />
      {hasErrors && (
        <p id="description-error" className="text-sm text-destructive">
          {errors?.join(' ')}
        </p>
      )}
    </div>
  );
}
