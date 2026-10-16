'use client';

import { ChevronRightIcon, FolderIcon, FolderOpenIcon, HomeIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';
import { folderPath, type DocumentFolderDto } from '@/modules/documents/client';

import { folderHref } from './docs-href';

/**
 * Раскрытые ветки — удобство одного зрителя: localStorage, без него всё работает. Хранятся
 * строкой JSON; подписка — на `storage` (другие вкладки) и своё событие (эта вкладка).
 */
const STORAGE_KEY = 'tasker:docs-tree-expanded';
const CHANGE_EVENT = 'tasker:docs-tree-expanded';

function storageKey(workspaceSlug: string): string {
  return `${STORAGE_KEY}:${workspaceSlug}`;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(workspaceSlug: string): string {
  try {
    return window.localStorage.getItem(storageKey(workspaceSlug)) ?? '[]';
  } catch {
    return '[]';
  }
}

function parseIds(raw: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeIds(workspaceSlug: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(workspaceSlug), JSON.stringify([...ids]));
  } catch {
    // Хранилище недоступно (приватный режим) — раскрытие просто не запомнится.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

interface FolderTreeProps {
  workspaceSlug: string;
  folders: DocumentFolderDto[];
  /** Текущая папка обзора; null — корень, undefined — не в обзоре (страница документа). */
  activeFolderId: string | null | undefined;
  /** Закрыть мобильную панель после перехода. */
  onNavigate?: () => void;
}

/**
 * Дерево папок пространства: ссылки на папки и кнопки раскрытия (паттерн «disclosure
 * navigation» — ссылки остаются обычными ссылками для клавиатуры и скринридеров).
 */
export function FolderTree({
  workspaceSlug,
  folders,
  activeFolderId,
  onNavigate,
}: FolderTreeProps) {
  const children = useMemo(() => {
    const map = new Map<string | null, DocumentFolderDto[]>();
    for (const folder of folders) {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return map;
  }, [folders]);

  // На сервере и при гидратации — свёрнуто ('[]'), затем — сохранённое состояние.
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(workspaceSlug),
    () => '[]',
  );
  const expanded = useMemo(() => parseIds(raw), [raw]);

  // При переходе в папку раскрываем путь к ней (один раз — дальше ветки сворачиваются вручную).
  useEffect(() => {
    if (!activeFolderId) return;
    const current = parseIds(readRaw(workspaceSlug));
    const ancestors = folderPath(folders, activeFolderId)
      .slice(0, -1)
      .map((folder) => folder.id);
    if (ancestors.every((id) => current.has(id))) return;
    for (const id of ancestors) current.add(id);
    writeIds(workspaceSlug, current);
  }, [workspaceSlug, folders, activeFolderId]);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeIds(workspaceSlug, next);
  }

  function renderLevel(parentId: string | null, depth: number) {
    const level = children.get(parentId);
    if (!level?.length) return null;
    return (
      <ul
        className="grid grid-cols-[minmax(0,1fr)] gap-0.5"
        role={depth === 0 ? undefined : 'group'}
      >
        {level.map((folder) => {
          const hasChildren = (children.get(folder.id)?.length ?? 0) > 0;
          const isOpen = expanded.has(folder.id);
          const isActive = folder.id === activeFolderId;
          return (
            <li key={folder.id}>
              <div
                className={cn(
                  'group flex items-center gap-1 rounded-md pr-2 text-sm',
                  isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
                style={{ paddingLeft: `${depth * 0.75 + 0.25}rem` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(folder.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Свернуть' : 'Развернуть'} «${folder.name}»`}
                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronRightIcon
                      className={cn(
                        'size-4 transition-transform motion-reduce:transition-none',
                        isOpen && 'rotate-90',
                      )}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <span className="size-6 shrink-0" aria-hidden />
                )}
                <Link
                  href={folderHref(workspaceSlug, folder.id)}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  title={folder.name}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 focus-visible:underline focus-visible:outline-none"
                >
                  {isActive || isOpen ? (
                    <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate">{folder.name}</span>
                  {folder.documentsCount > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {folder.documentsCount}
                    </span>
                  )}
                </Link>
              </div>
              {hasChildren && isOpen && renderLevel(folder.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  const rootActive = activeFolderId === null;
  // minmax(0,1fr) у nav и ul: длинные имена обрезаются многоточием, а не растягивают колонку.
  return (
    <nav aria-label="Папки документов" className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <Link
        href={folderHref(workspaceSlug, null)}
        onClick={onNavigate}
        aria-current={rootActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          rootActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
        )}
      >
        <HomeIcon className="size-4 text-muted-foreground" aria-hidden />
        Все документы
      </Link>
      {renderLevel(null, 0) ?? (
        <p className="px-2 py-1 text-sm text-muted-foreground">Папок пока нет</p>
      )}
    </nav>
  );
}
