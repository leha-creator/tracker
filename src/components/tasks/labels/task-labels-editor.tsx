'use client';

import { Check, Plus, Tag } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { StatusDot } from '@/components/projects/status-badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  createLabelAction,
  setTaskLabelsAction,
  TASK_LABEL_NAME_MAX_LENGTH,
  TASK_LABELS_PER_TASK,
  type TaskLabelRefDto,
} from '@/modules/tasks/client';

import { useTaskSaveStatus } from '../task-panel/task-save-status';
import { LabelChip } from './label-chip';

interface TaskLabelsEditorProps {
  workspaceId: string;
  taskId: string;
  /** Метки задачи. */
  value: TaskLabelRefDto[];
  /** Все метки пространства. */
  options: TaskLabelRefDto[];
  labelledBy: string;
}

function signature(labels: TaskLabelRefDto[]): string {
  return labels.map((label) => label.id).join();
}

function byName(a: TaskLabelRefDto, b: TaskLabelRefDto): number {
  return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
}

/**
 * Метки задачи: поиск, отметка и «Создать „…“». Каждое изменение сохраняется сразу (оптимистично),
 * сохранения идут по очереди — сервер всегда получает последний набор.
 */
export function TaskLabelsEditor({
  workspaceId,
  taskId,
  value,
  options,
  labelledBy,
}: TaskLabelsEditorProps) {
  const { begin } = useTaskSaveStatus();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(value);
  const [created, setCreated] = useState<TaskLabelRefDto[]>([]);
  const [syncedValue, setSyncedValue] = useState(signature(value));
  const [creating, setCreating] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState(0);

  // Новые данные с сервера (после сохранения или правки в другом месте) — если своих
  // несохранённых изменений нет.
  if (signature(value) !== syncedValue && pending === 0) {
    setSyncedValue(signature(value));
    setSelected(value);
  }

  const known = new Map([...options, ...created].map((label) => [label.id, label]));
  const all = [...known.values()].sort(byName);
  const selectedIds = new Set(selected.map((label) => label.id));
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const exact = all.some((label) => label.name.toLowerCase() === trimmed.toLowerCase());

  function save(next: TaskLabelRefDto[]) {
    const previous = selected;
    setSelected(next);
    setPending((count) => count + 1);
    const done = begin();
    queue.current = queue.current.then(async () => {
      const result = await setTaskLabelsAction({
        workspaceId,
        taskId,
        labelIds: next.map((label) => label.id),
      });
      setPending((count) => count - 1);
      done(result.ok);
      if (!result.ok) {
        toast.error(result.error.message);
        setSelected(previous);
      }
    });
  }

  function toggle(label: TaskLabelRefDto) {
    if (selectedIds.has(label.id)) {
      save(selected.filter((item) => item.id !== label.id));
    } else if (selected.length >= TASK_LABELS_PER_TASK) {
      toast.error(`У задачи может быть не больше ${TASK_LABELS_PER_TASK} меток`);
    } else {
      save([...selected, label].sort(byName));
    }
  }

  async function create() {
    if (!trimmed || creating) return;
    if (selected.length >= TASK_LABELS_PER_TASK) {
      toast.error(`У задачи может быть не больше ${TASK_LABELS_PER_TASK} меток`);
      return;
    }
    setCreating(true);
    const result = await createLabelAction({ workspaceId, name: trimmed, color: 'gray' });
    setCreating(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const label = { id: result.data.id, name: result.data.name, color: result.data.color };
    setCreated((items) => [...items, label]);
    setQuery('');
    save([...selected, label].sort(byName));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-labelledby={labelledBy}
          aria-describedby={`${labelledBy}-value`}
          className="-ml-2 inline-flex min-h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span id={`${labelledBy}-value`} className="flex min-w-0 flex-wrap items-center gap-1">
            {selected.length > 0 ? (
              selected.map((label) => <LabelChip key={label.id} label={label} />)
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Tag aria-hidden className="size-3.5" />
                Добавить метку
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput
            placeholder="Найти или создать метку"
            value={query}
            maxLength={TASK_LABEL_NAME_MAX_LENGTH}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{trimmed ? 'Меток не найдено' : 'Меток пока нет'}</CommandEmpty>
            {all.length > 0 && (
              <CommandGroup>
                {all.map((label) => {
                  const checked = selectedIds.has(label.id);
                  return (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={() => toggle(label)}
                      aria-checked={checked}
                      role="menuitemcheckbox"
                    >
                      <StatusDot color={label.color} className="size-2" />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      <Check
                        aria-hidden
                        className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {trimmed && !exact && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`__create__${trimmed}`}
                  disabled={creating}
                  onSelect={() => void create()}
                >
                  <Plus aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Создать «{trimmed}»</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
