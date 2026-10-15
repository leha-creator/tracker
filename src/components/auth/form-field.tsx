import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps extends ComponentProps<typeof Input> {
  name: string;
  label: string;
  errors?: string[];
}

/** Поле формы с подписью и ошибками валидации с сервера. */
export function FormField({ name, label, errors, ...inputProps }: FormFieldProps) {
  const errorId = `${name}-error`;
  const hasErrors = Boolean(errors?.length);
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? errorId : undefined}
        {...inputProps}
      />
      {hasErrors && (
        <p id={errorId} className="text-sm text-destructive">
          {errors?.join(' ')}
        </p>
      )}
    </div>
  );
}

/** Общая ошибка формы (не привязанная к полю). */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
