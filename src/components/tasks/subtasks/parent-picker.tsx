'use client';

import { ChevronDown, XIcon } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  PARENT_SEARCH_MAX_LENGTH,
  searchParentCandidatesAction,
  setTaskParentAction,
  type TaskAncestorDto,
  type TaskParentOptionDto,
} from '@/modules/tasks/client';

import { useTaskSaveStatus } from '../task-panel/task-save-status';

const SEARCH_DEBOUNCE_MS = 250;

interface ParentPickerProps {
  workspaceId: string;
  taskId: string;
  /** Текущий родитель (последний предок) или null. */
  parent: TaskAncestorDto | null;
  labelledBy: string;
}

/**
 * Родительская задача: поиск по номеру или названию, «Без родителя» — задача верхнего уровня.
 * Сама задача и её подзадачи в поиск не попадают; цикл и глубину сервер проверяет при сохранении.
 */
export function ParentPicker({ workspaceId, taskId, parent, labelledBy }: ParentPickerProps) {
  const { begin } = useTaskSaveStatus();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TaskParentOptionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchParentCandidatesAction({ workspaceId, taskId, q: query }).then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceId, taskId, query, open]);

  function save(parentId: string | null, label: string) {
    setOpen(false);
    const done = begin();
    startTransition(async () => {
      const result = await setTaskParentAction({ workspaceId, taskId, parentId });
      done(result.ok);
      if (result.ok) toast.success(label);
      else toast.error(result.error.message);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-labelledby={labelledBy}
          aria-describedby={`${labelledBy}-value`}
          disabled={pending}
          className="-ml-2 inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          <span id={`${labelledBy}-value`} className="flex min-w-0 items-baseline gap-1.5">
            {parent ? (
              <>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {parent.key}
                </span>
                <span className="truncate">{parent.title}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Нет — задача верхнего уровня</span>
            )}
          </span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Номер (#42) или название"
            value={query}
            maxLength={PARENT_SEARCH_MAX_LENGTH}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{error ?? (loading ? 'Поиск…' : 'Задачи не найдены')}</CommandEmpty>
            {parent && (
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => save(null, 'Задача перенесена на верхний уровень')}
                >
                  <XIcon aria-hidden />
                  Без родителя
                </CommandItem>
              </CommandGroup>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Сделать подзадачей">
                {results.map((option) => (
                  <CommandItem
                    key={option.taskId}
                    value={option.taskId}
                    onSelect={() => save(option.taskId, `Теперь подзадача ${option.key}`)}
                  >
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {option.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
