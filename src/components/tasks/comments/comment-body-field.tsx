'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/users/user-avatar';
import { cn } from '@/lib/utils';
import {
  filterMentionCandidates,
  findMentionQuery,
  mentionText,
  TASK_COMMENT_MAX_LENGTH,
  type MentionCandidate,
} from '@/modules/tasks/client';

interface CommentBodyFieldProps {
  id: string;
  label: string;
  defaultValue?: string;
  errors?: string[];
  autoFocus?: boolean;
  onEscape?: () => void;
  placeholder?: string;
  /** Высота в покое; поле растёт по содержимому. */
  rows?: number;
  /** Участники пространства для подсказки после `@`; без них подсказки нет. */
  members?: readonly MentionCandidate[];
  /** Где показывать подсказку: под полем или над ним (форма, закреплённая внизу панели). */
  suggestionsPlacement?: 'below' | 'above';
}

interface Suggestions {
  /** Позиция `@` в тексте. */
  start: number;
  items: MentionCandidate[];
  active: number;
}

/**
 * Текст комментария: Ctrl/⌘+Enter — отправить форму, Esc — `onEscape`. После `@` — подсказка с
 * участниками: ввод букв фильтрует список, ↑/↓ — выбор, Enter или Tab — вставить `@Имя`, Esc —
 * закрыть подсказку.
 */
export function CommentBodyField({
  id,
  label,
  defaultValue,
  errors,
  autoFocus,
  onEscape,
  placeholder,
  rows = 3,
  members,
  suggestionsPlacement = 'below',
}: CommentBodyFieldProps) {
  const errorId = `${id}-error`;
  const listId = useId();
  const hasErrors = Boolean(errors?.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const open = suggestions !== null && suggestions.items.length > 0;

  /** Пересчитать подсказку по тексту слева от курсора. */
  function updateSuggestions(textarea: HTMLTextAreaElement) {
    if (!members?.length || textarea.selectionStart !== textarea.selectionEnd) {
      setSuggestions(null);
      return;
    }
    const match = findMentionQuery(textarea.value, textarea.selectionStart);
    if (!match) {
      setSuggestions(null);
      return;
    }
    const items = filterMentionCandidates(members, match.query);
    setSuggestions((current) => ({
      start: match.start,
      items,
      // Тот же запрос — сохраняем выбранную строку, иначе — первая.
      active: current?.start === match.start ? Math.min(current.active, items.length - 1) : 0,
    }));
  }

  function choose(member: MentionCandidate) {
    const textarea = textareaRef.current;
    if (!textarea || !suggestions) return;
    textarea.setRangeText(mentionText(member), suggestions.start, textarea.selectionStart, 'end');
    textarea.focus();
    setSuggestions(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && !event.ctrlKey && !event.metaKey) {
      const count = suggestions.items.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSuggestions({ ...suggestions, active: (suggestions.active + step + count) % count });
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const member = suggestions.items[suggestions.active];
        if (member) choose(member);
        return;
      }
      if (event.key === 'Escape') {
        // Esc закрывает только подсказку, а не форму правки.
        event.preventDefault();
        event.stopPropagation();
        setSuggestions(null);
        return;
      }
    }
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

  const activeId = open ? `${listId}-${suggestions.active}` : undefined;
  const describedBy = hasErrors ? errorId : undefined;

  return (
    <div className="relative grid gap-1">
      <Textarea
        ref={textareaRef}
        id={id}
        name="body"
        rows={rows}
        placeholder={placeholder}
        maxLength={TASK_COMMENT_MAX_LENGTH}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
        onInput={(event) => updateSuggestions(event.currentTarget)}
        onSelect={(event) => updateSuggestions(event.currentTarget)}
        onBlur={() => setSuggestions(null)}
        aria-label={label}
        aria-invalid={hasErrors || undefined}
        aria-describedby={describedBy}
        {...(members?.length
          ? {
              role: 'combobox',
              'aria-autocomplete': 'list' as const,
              'aria-expanded': open,
              'aria-controls': listId,
              'aria-activedescendant': activeId,
            }
          : {})}
      />
      {/* Список всегда в DOM — aria-controls указывает на существующий элемент. */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Упомянуть участника"
        hidden={!open}
        className={cn(
          'absolute inset-x-0 z-20 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md',
          suggestionsPlacement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
        )}
      >
        {open &&
          suggestions.items.map((member, index) => (
            <li
              key={member.userId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === suggestions.active}
              // mousedown не уводит фокус из поля — выбор не закрывает подсказку раньше времени.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(member)}
              onMouseEnter={() => setSuggestions({ ...suggestions, active: index })}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                index === suggestions.active && 'bg-accent text-accent-foreground',
              )}
            >
              <UserAvatar user={{ name: member.name, image: member.image ?? null }} />
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {member.isAgent ? '(агент)' : member.email}
              </span>
            </li>
          ))}
      </ul>
      {hasErrors && (
        <p id={errorId} className="text-sm text-destructive">
          {errors?.join(' ')}
        </p>
      )}
    </div>
  );
}
