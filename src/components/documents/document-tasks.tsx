'use client';

import { CheckCircle2Icon, CircleIcon, LinkIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
  linkDocumentToTaskAction,
  searchTasksForLinkAction,
  unlinkDocumentFromTaskAction,
  type LinkedTaskDto,
} from '@/modules/documents/client';

import { taskPageHref } from '../tasks/task-panel/task-panel-href';

const SEARCH_DEBOUNCE_MS = 250;

function TaskSearch({
  workspaceId,
  documentId,
  onPick,
}: {
  workspaceId: string;
  documentId: string;
  onPick: (task: LinkedTaskDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkedTaskDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchTasksForLinkAction({ workspaceId, q: query, documentId }).then((result) => {
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
  }, [workspaceId, documentId, query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <LinkIcon aria-hidden />
          Привязать к задаче
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Номер (#42) или название"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{error ?? (loading ? 'Поиск…' : 'Задачи не найдены')}</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => {
                      setOpen(false);
                      onPick(task);
                    }}
                  >
                    <span className="shrink-0 text-muted-foreground tabular-nums">{task.key}</span>
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
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

/**
 * Задачи, к которым привязан документ. Привязывать и отвязывать может любой участник —
 * это правка задачи, а не документа.
 */
export function DocumentTasks({
  workspaceId,
  workspaceSlug,
  documentId,
  tasks,
}: {
  workspaceId: string;
  workspaceSlug: string;
  documentId: string;
  tasks: LinkedTaskDto[];
}) {
  const [pending, startTransition] = useTransition();

  function link(task: LinkedTaskDto) {
    startTransition(async () => {
      const result = await linkDocumentToTaskAction({ workspaceId, taskId: task.id, documentId });
      if (result.ok) toast.success(`Привязано к задаче ${task.key}`);
      else toast.error(result.error.message);
    });
  }

  function unlink(task: LinkedTaskDto) {
    startTransition(async () => {
      const result = await unlinkDocumentFromTaskAction({
        workspaceId,
        taskId: task.id,
        documentId,
      });
      if (result.ok) toast.success(`Отвязано от задачи ${task.key}`);
      else toast.error(result.error.message);
    });
  }

  return (
    <section
      className="grid gap-3"
      aria-labelledby="document-tasks-heading"
      aria-busy={pending || undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="document-tasks-heading" className="text-base font-semibold">
          Задачи <span className="text-muted-foreground tabular-nums">{tasks.length}</span>
        </h2>
        <TaskSearch workspaceId={workspaceId} documentId={documentId} onPick={link} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Документ пока не привязан к задачам.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-3 py-2">
              {task.isDone ? (
                <CheckCircle2Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-label="Выполнена"
                />
              ) : (
                <CircleIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-label="Открыта"
                />
              )}
              <Link
                href={taskPageHref(workspaceSlug, task.number)}
                className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline"
              >
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {task.key}
                </span>
                <span
                  className={
                    task.isDone ? 'truncate text-muted-foreground line-through' : 'truncate'
                  }
                >
                  {task.title}
                </span>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => unlink(task)}
                disabled={pending}
                aria-label={`Отвязать от задачи ${task.key}`}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
