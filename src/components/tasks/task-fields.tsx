'use client';

import { CalendarDays, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react';

import { StatusDot } from '@/components/projects/status-badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/users/user-avatar';
import { cn } from '@/lib/utils';
import type { ProjectStatusDto } from '@/modules/projects/client';
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
  type TaskPriority,
} from '@/modules/tasks/client';

import { formatDueDate } from './due-date';
import { PriorityBadge } from './priority-badge';

/** Участник пространства в селекте ответственного. */
export interface MemberOption {
  userId: string;
  name: string;
  /** Адрес фото; без него — инициалы. */
  image?: string | null;
  /** Агент пространства — с подписью «(агент)». */
  isAgent?: boolean;
}

// У radix Select нет пустого значения: «не выбрано» — отдельный ключ, в форму уходит ''.
const NONE = '__none__';

/*
 * Режим «чтения»: открытая задача выглядит как готовый документ. В покое у поля нет рамки, фона
 * и стрелки; при наведении — лёгкая обводка и курсор; при фокусе и открытом списке — обычное поле.
 * `hover:` в Tailwind v4 срабатывает только на устройствах с наведением — на тач-экранах обводки
 * нет, нажатие сразу открывает выбор. components/ui не правим: классы переопределяются снаружи.
 */
const QUIET_BASE =
  'border-transparent bg-transparent shadow-none transition-[border-color,background-color,box-shadow] duration-150 dark:bg-transparent hover:border-border dark:hover:bg-input/20';
const QUIET_ACTIVE =
  'focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 dark:focus-visible:bg-input/30';

/** Триггер select в режиме чтения: стрелка проявляется при наведении, фокусе и открытии. */
export const QUIET_SELECT_TRIGGER = cn(
  QUIET_BASE,
  QUIET_ACTIVE,
  'h-8 max-w-full min-w-0 cursor-pointer px-2',
  'data-[state=open]:border-ring data-[state=open]:bg-background data-[state=open]:ring-3 data-[state=open]:ring-ring/50 dark:data-[state=open]:bg-input/30',
  '[&>svg:last-child]:opacity-0 [&>svg:last-child]:transition-opacity hover:[&>svg:last-child]:opacity-100 focus-visible:[&>svg:last-child]:opacity-100 data-[state=open]:[&>svg:last-child]:opacity-100 pointer-coarse:[&>svg:last-child]:opacity-100',
);

/** Кнопка-значение в режиме чтения (срок). */
const QUIET_BUTTON = cn(
  QUIET_BASE,
  'inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-sm outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
);

/** Текстовое поле в режиме чтения: без уголка изменения размера и полосы прокрутки. */
const QUIET_TEXT = cn(
  QUIET_BASE,
  QUIET_ACTIVE,
  'min-h-0 cursor-text resize-none overflow-hidden px-2 placeholder:text-muted-foreground/70',
);

interface QuietFieldProps {
  id: string;
  /** id подписи свойства (`dt`) — для `aria-labelledby`. */
  labelledBy: string;
  /** Имя скрытого поля формы (форма создания); без имени — только состояние. */
  name?: string;
  invalid?: boolean;
}

/** Инициалы участника — декоративно, имя читается текстом рядом. */
export function AssigneeSelect({
  id,
  labelledBy,
  name,
  invalid,
  members,
  value,
  onChange,
}: QuietFieldProps & {
  members: MemberOption[];
  /** userId или '' — не назначен. */
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
        <SelectTrigger
          id={id}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || undefined}
          className={cn(QUIET_SELECT_TRIGGER, '-ml-2')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span
              aria-hidden
              className="inline-grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
            >
              <UserRound className="size-3.5" />
            </span>
            <span className="text-muted-foreground">Не назначен</span>
          </SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              <UserAvatar user={{ name: member.name, image: member.image ?? null }} />
              <span className="truncate">{member.name}</span>
              {member.isAgent && <span className="text-muted-foreground">(агент)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function PrioritySelect({
  id,
  labelledBy,
  name,
  invalid,
  value,
  onChange,
}: QuietFieldProps & { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  return (
    <Select name={name} value={value} onValueChange={(next) => onChange(next as TaskPriority)}>
      <SelectTrigger
        id={id}
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
        className={cn(QUIET_SELECT_TRIGGER, '-ml-2')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            {priority === 'none' ? (
              <span className="text-muted-foreground">Без приоритета</span>
            ) : (
              <PriorityBadge priority={priority} className="text-sm" />
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Сегодня в часовом поясе пользователя, `YYYY-MM-DD`. */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Срок. В покое — текст даты (маска `дд.мм.гггг` нативного поля выдавала бы поле); по нажатию —
 * `input type=date` с открытым выбором. Значение уходит в `onChange` при выборе (blur, Enter)
 * и очистке «×».
 */
export function DueDatePicker({
  id,
  labelledBy,
  name,
  invalid,
  value,
  onChange,
  isOverdue,
}: QuietFieldProps & {
  /** `YYYY-MM-DD` или ''. */
  value: string;
  onChange: (value: string) => void;
  /** Просрочка с сервера (учитывает статус «Готово»); для нового значения — сравнение с сегодня. */
  isOverdue?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    input?.focus();
    try {
      input?.showPicker();
    } catch {
      // showPicker недоступен (старый браузер, нет жеста) — остаётся обычное поле даты.
    }
  }, [editing]);

  function finish(next: string) {
    setEditing(false);
    if (next !== value) onChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      // Esc закрывает только поле, не панель.
      event.preventDefault();
      setEditing(false);
    }
  }

  const overdue = value !== '' && (isOverdue ?? value < todayIso());

  return (
    <div className="group/due -ml-2 flex min-w-0 items-center gap-0.5">
      {name && <input type="hidden" name={name} value={value} />}
      {editing ? (
        <Input
          ref={inputRef}
          id={id}
          type="date"
          aria-labelledby={labelledBy}
          defaultValue={value}
          onBlur={(event) => finish(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          className="h-8 w-44"
        />
      ) : (
        <button
          type="button"
          id={id}
          aria-labelledby={`${labelledBy} ${id}`}
          data-invalid={invalid || undefined}
          onClick={() => setEditing(true)}
          className={cn(
            QUIET_BUTTON,
            'data-invalid:border-destructive',
            overdue && 'font-medium text-destructive',
            value === '' && 'text-muted-foreground',
          )}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {value ? (
            <time dateTime={value}>{formatDueDate(value, 'long')}</time>
          ) : (
            <span>Без срока</span>
          )}
          {overdue && <span className="sr-only">(просрочено)</span>}
        </button>
      )}
      {value && !editing && (
        <button
          type="button"
          aria-label="Убрать срок"
          title="Убрать срок"
          onClick={() => onChange('')}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity outline-none group-focus-within/due:opacity-100 group-hover/due:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

interface QuietTextProps {
  id: string;
  name: string;
  defaultValue?: string;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  /** Сохранение по blur (и Enter у названия, Ctrl/⌘+Enter у описания). */
  onCommit?: (value: string) => void;
  /** Esc — вернуть значение до правки (без сохранения). */
  onRevert?: () => void;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

function isSubmitKey(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key === 'NumpadEnter');
}

/** Название крупным шрифтом; Enter не переносит строку, а завершает правку. */
export function TaskTitleInput({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
  autoFocus,
  onCommit,
  onRevert,
  className,
  ref,
}: QuietTextProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !isSubmitKey(event)) {
      event.preventDefault();
      if (onCommit) event.currentTarget.blur();
    } else if (event.key === 'Escape' && onRevert) {
      event.preventDefault();
      onRevert();
      event.currentTarget.blur();
    } else if (isSubmitKey(event) && !onCommit) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <Textarea
      ref={ref}
      id={id}
      name={name}
      rows={1}
      required
      maxLength={TASK_TITLE_MAX_LENGTH}
      defaultValue={defaultValue}
      autoFocus={autoFocus}
      placeholder="Название задачи"
      aria-label="Название"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onBlur={onCommit ? (event) => onCommit(event.currentTarget.value) : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        QUIET_TEXT,
        '-mx-2 py-1 text-xl leading-snug font-semibold tracking-tight break-words md:text-2xl',
        className,
      )}
    />
  );
}

/** Описание: абзац текста; рамка появляется при наведении, поле — при фокусе. */
export function TaskDescriptionInput({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
  onCommit,
  onRevert,
  className,
  ref,
  labelledBy,
}: QuietTextProps & { labelledBy: string }) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitKey(event)) {
      event.preventDefault();
      if (onCommit) event.currentTarget.blur();
      else event.currentTarget.form?.requestSubmit();
    } else if (event.key === 'Escape' && onRevert) {
      event.preventDefault();
      onRevert();
      event.currentTarget.blur();
    }
  }

  return (
    <Textarea
      ref={ref}
      id={id}
      name={name}
      maxLength={TASK_DESCRIPTION_MAX_LENGTH}
      defaultValue={defaultValue}
      placeholder="Добавьте описание…"
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onBlur={onCommit ? (event) => onCommit(event.currentTarget.value) : undefined}
      onKeyDown={handleKeyDown}
      className={cn(QUIET_TEXT, '-mx-2 min-h-16 py-1.5 leading-relaxed', className)}
    />
  );
}

/** Выбор статуса проекта; значение уходит в форму полем `name`. */
export function StatusSelect({
  statuses,
  value,
  onValueChange,
  name = 'statusId',
  label,
  disabled,
  id,
  quiet = false,
}: {
  statuses: ProjectStatusDto[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  label: string;
  disabled?: boolean;
  id?: string;
  /** Режим чтения (свойства задачи): без рамки до наведения. */
  quiet?: boolean;
}) {
  return (
    <Select name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        size="sm"
        aria-label={label}
        className={quiet ? cn(QUIET_SELECT_TRIGGER, 'h-7 text-muted-foreground') : 'w-44'}
      >
        <SelectValue placeholder="Статус" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <StatusDot color={status.color} />
            {status.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Ошибки поля под ним. */
export function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {errors.join(' ')}
    </p>
  );
}
