'use client';

import {
  FileIcon,
  FileTextIcon,
  FolderOpenIcon,
  ListTodoIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
  UserCheckIcon,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { EntityIconTile } from '@/components/entity-icon/entity-icon';
import { NEW_WORKSPACE_HREF } from '@/components/layout/create-panel-href';
import { currentWorkspaceSlug } from '@/components/layout/nav-items';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { UserAvatar } from '@/components/users/user-avatar';
import { STATUS_CATEGORY_LABELS, type StatusCategory } from '@/modules/projects/client';
import {
  globalSearchAction,
  isSearchableQuery,
  normalizeSearchQuery,
  SEARCH_QUERY_MAX_LENGTH,
  type GlobalSearchResultDto,
} from '@/modules/search/client';
import type { WorkspaceListItemDto } from '@/modules/workspaces/client';

import { documentHref, memberHref, paletteTaskHref } from './search-hrefs';

/** Задержка запроса после ввода. */
const SEARCH_DEBOUNCE_MS = 200;

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: GlobalSearchResultDto };

interface PaletteCommand {
  id: string;
  label: string;
  icon: typeof PlusIcon;
  href: string;
}

const subscribeNoop = () => () => {};

/** Mac — «⌘K», остальные — «Ctrl K». На сервере — «Ctrl K». */
function useIsMac(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/** Название статуса; проект — в подсказке (на узкой строке оно важнее). */
function statusText(status: { name: string; category: string }): string {
  const category = STATUS_CATEGORY_LABELS[status.category as StatusCategory] as string | undefined;
  return status.name || category || '';
}

/** value первого результата в порядке групп; null — ничего не найдено. */
function firstResultValue(data: GlobalSearchResultDto): string | null {
  if (data.tasks[0]) return `task:${data.tasks[0].taskId}`;
  if (data.documents[0]) return `doc:${data.documents[0].id}`;
  if (data.members[0]) return `member:${data.members[0].userId}`;
  if (data.workspaces[0]) return `workspace:${data.workspaces[0].id}`;
  return null;
}

/**
 * Палитра Cmd/Ctrl+K: поиск задач, документов и участников текущего пространства (из адреса),
 * вне пространства — пространств; плюс быстрые команды. Кнопка-триггер — в шапке.
 */
export function CommandPalette({ workspaces }: { workspaces: WorkspaceListItemDto[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMac = useIsMac();

  const slug = currentWorkspaceSlug(pathname);
  const workspace = workspaces.find((item) => item.slug === slug) ?? null;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  /** Выделенный пункт (value cmdk): с приходом результатов — первый результат, а не команда. */
  const [selected, setSelected] = useState('');
  /** Номер последнего запроса: ответы устаревших запросов отбрасываются. */
  const requestRef = useRef(0);

  const q = normalizeSearchQuery(input);
  const searchable = isSearchableQuery(q);

  /** Открыта ли палитра — для хоткея без пересоздания обработчика. */
  const openRef = useRef(false);
  /**
   * Куда вернуть фокус после закрытия: кнопка-триггер или поле, где нажали хоткей. Radix сам
   * возвращает фокус только на свой DialogTrigger, а кнопка палитры живёт вне диалога.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const handleOpenChange = useCallback((value: boolean) => {
    if (value === openRef.current) return;
    openRef.current = value;
    setOpen(value);
    if (value) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    setInput('');
    setState({ status: 'idle' });
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    // После снятия ловушки фокуса диалога.
    requestAnimationFrame(() => target?.isConnected && target.focus());
  }, []);

  // Хоткей работает и в полях ввода: Ctrl+K в браузере ничего полезного не делает.
  // e.code, а не e.key: в русской раскладке key — «л».
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'KeyK' || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      handleOpenChange(!openRef.current);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleOpenChange]);

  useEffect(() => {
    if (!open || !searchable) {
      requestRef.current += 1;
      return;
    }
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      setState({ status: 'loading' });
      void globalSearchAction({ workspaceId: workspace?.id ?? null, q }).then(
        (result) => {
          if (requestRef.current !== requestId) return;
          if (result.ok) setSelected(firstResultValue(result.data) ?? '');
          setState(
            result.ok
              ? { status: 'ready', data: result.data }
              : { status: 'error', message: result.error.message },
          );
        },
        () => {
          if (requestRef.current !== requestId) return;
          setState({ status: 'error', message: 'Не удалось выполнить поиск' });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, q, searchable, workspace?.id]);

  const go = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [handleOpenChange, router],
  );

  const search = searchParams.toString();
  const myTasks: PaletteCommand = {
    id: 'my-tasks',
    label: 'Мои задачи',
    icon: UserCheckIcon,
    href: '/my-tasks',
  };
  const commands: PaletteCommand[] = workspace
    ? [
        {
          id: 'new-task',
          label: 'Новая задача',
          icon: PlusIcon,
          href: paletteTaskHref(pathname, search, workspace.slug, 'new'),
        },
        {
          id: 'tasks',
          label: 'Задачи',
          icon: ListTodoIcon,
          href: `/w/${workspace.slug}/tasks`,
        },
        myTasks,
        {
          id: 'docs',
          label: 'Документы',
          icon: FolderOpenIcon,
          href: `/w/${workspace.slug}/docs`,
        },
        {
          id: 'members',
          label: 'Участники',
          icon: UsersIcon,
          href: `/w/${workspace.slug}/settings/members`,
        },
        ...(workspace.role === 'owner'
          ? [
              {
                id: 'settings',
                label: 'Настройки пространства',
                icon: SettingsIcon,
                href: `/w/${workspace.slug}/settings`,
              },
            ]
          : []),
      ]
    : [
        {
          id: 'new-workspace',
          label: 'Новое пространство',
          icon: PlusIcon,
          href: NEW_WORKSPACE_HREF,
        },
        myTasks,
      ];

  const folded = q.toLocaleLowerCase('ru');
  const visibleCommands = folded
    ? commands.filter((command) => command.label.toLocaleLowerCase('ru').includes(folded))
    : commands;

  const data = state.status === 'ready' && searchable ? state.data : null;
  const loading = searchable && (state.status === 'loading' || (state.status === 'idle' && open));
  const hasResults =
    data !== null &&
    data.tasks.length + data.documents.length + data.members.length + data.workspaces.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label="Поиск"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        className="flex h-8 items-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:size-8 max-md:justify-center md:w-52 md:border md:bg-muted/40 md:px-2.5"
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <span className="max-md:sr-only">Поиск…</span>
        <kbd
          aria-hidden
          className="ml-auto rounded border bg-background px-1.5 font-sans text-[11px] leading-5 font-medium max-md:hidden"
        >
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Поиск"
        description={
          workspace
            ? `Задачи, документы и участники пространства «${workspace.name}», команды`
            : 'Пространства и команды'
        }
        className="top-[12vh] sm:max-w-xl"
      >
        {/* Результаты уже отфильтрованы сервером: встроенный фильтр cmdk выключен. */}
        <Command shouldFilter={false} label="Поиск" value={selected} onValueChange={setSelected}>
          <CommandInput
            value={input}
            onValueChange={setInput}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            placeholder={
              workspace ? 'Задача, TSK-42, документ, участник…' : 'Пространство или команда…'
            }
          />
          <CommandList className="max-h-[min(26rem,60vh)]">
            {loading && !data && (
              <div
                role="status"
                className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              >
                <Loader2Icon aria-hidden className="size-4 animate-spin" />
                Ищем…
              </div>
            )}
            {state.status === 'error' && searchable && (
              <p role="alert" className="py-6 text-center text-sm text-destructive">
                {state.message}
              </p>
            )}
            {data && !hasResults && visibleCommands.length === 0 && (
              <CommandEmpty>Ничего не найдено</CommandEmpty>
            )}
            {!searchable && q.length > 0 && visibleCommands.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Введите хотя бы 2 символа
              </p>
            )}

            {data && workspace && data.tasks.length > 0 && (
              <CommandGroup heading="Задачи">
                {data.tasks.map((task) => (
                  <CommandItem
                    key={task.taskId}
                    value={`task:${task.taskId}`}
                    onSelect={() =>
                      go(paletteTaskHref(pathname, search, workspace.slug, task.number))
                    }
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {task.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.status && (
                      <span
                        title={`${task.status.projectName} · ${statusText(task.status)}`}
                        className="max-w-40 shrink-0 truncate text-xs text-muted-foreground max-sm:hidden"
                      >
                        {statusText(task.status)}
                        {task.moreProjects > 0 && ` +${task.moreProjects}`}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {data && workspace && data.documents.length > 0 && (
              <CommandGroup heading="Документы">
                {data.documents.map((document) => {
                  const Icon = document.kind === 'note' ? FileTextIcon : FileIcon;
                  return (
                    <CommandItem
                      key={document.id}
                      value={`doc:${document.id}`}
                      onSelect={() => go(documentHref(workspace.slug, document.id))}
                    >
                      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{document.title}</span>
                      {document.folderPath && (
                        <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground max-sm:hidden">
                          {document.folderPath}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {data && workspace && data.members.length > 0 && (
              <CommandGroup heading="Участники">
                {data.members.map((member) => (
                  <CommandItem
                    key={member.userId}
                    value={`member:${member.userId}`}
                    onSelect={() => go(memberHref(workspace.slug, member.userId))}
                  >
                    <UserAvatar user={member} />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    {!member.isAgent && (
                      <span className="max-w-48 shrink-0 truncate text-xs text-muted-foreground max-sm:hidden">
                        {member.email}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {data && data.workspaces.length > 0 && (
              <CommandGroup heading="Пространства">
                {data.workspaces.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`workspace:${item.id}`}
                    onSelect={() => go(`/w/${item.slug}`)}
                  >
                    <EntityIconTile icon={item.icon} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {visibleCommands.length > 0 && (
              <CommandGroup heading="Команды">
                {visibleCommands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={`command:${command.id}`}
                    onSelect={() => go(command.href)}
                  >
                    <command.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{command.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
