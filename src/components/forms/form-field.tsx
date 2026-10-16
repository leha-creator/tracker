import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps extends ComponentProps<typeof Input> {
  name: string;
  label: string;
  errors?: string[];
}

/** Поле формы с подписью и ошибками валидации с сервера. id по умолчанию — name. */
export function FormField({ name, label, errors, id = name, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
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

/** Сообщение об успехе или подсказка над формой (не ошибка). */
export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  );
}
