'use client';

import type { KeyboardEvent } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { TASK_COMMENT_MAX_LENGTH } from '@/modules/tasks/client';

interface CommentBodyFieldProps {
  id: string;
  label: string;
  defaultValue?: string;
  errors?: string[];
  autoFocus?: boolean;
  onEscape?: () => void;
}

/** Текст комментария: Ctrl/⌘+Enter — отправить форму, Esc — `onEscape`. */
export function CommentBodyField({
  id,
  label,
  defaultValue,
  errors,
  autoFocus,
  onEscape,
}: CommentBodyFieldProps) {
  const errorId = `${id}-error`;
  const hasErrors = Boolean(errors?.length);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'Enter' || event.key === 'NumpadEnter')
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    } else if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div className="grid gap-1">
      <Textarea
        id={id}
        name="body"
        rows={3}
        required
        maxLength={TASK_COMMENT_MAX_LENGTH}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
        aria-label={label}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors ? errorId : undefined}
      />
      {hasErrors && (
        <p id={errorId} className="text-sm text-destructive">
          {errors?.join(' ')}
        </p>
      )}
    </div>
  );
}
