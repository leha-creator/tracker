'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  clearDocumentFilters,
  DOCUMENT_KIND_FILTER_LABELS,
  DOCUMENT_KIND_FILTERS,
  DOCUMENT_LIST_QUERY_MAX_LENGTH,
  DOCUMENT_LIST_SORT_LABELS,
  DOCUMENT_LIST_SORTS,
  isDocumentSearch,
  patchDocumentListQuery,
  type DocumentKindFilter,
  type DocumentListQuery,
  type DocumentListSort,
  type TagDto,
} from '@/modules/documents/client';

import { docsHref } from './docs-href';

const ALL = 'all';
const SEARCH_DEBOUNCE_MS = 300;

interface DocumentListToolbarProps {
  workspaceSlug: string;
  query: DocumentListQuery;
  tags: TagDto[];
}

/**
 * Поиск, фильтры и сортировка. Состояние — в URL: страница перерисовывается на сервере.
 * Поиск, тег или вид ищут по всему пространству.
 */
export function DocumentListToolbar({ workspaceSlug, query, tags }: DocumentListToolbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Поиск сменился снаружи (назад/вперёд, сброс) — синхронизируем поле.
  const [syncedQ, setSyncedQ] = useState(query.q);
  if (syncedQ !== query.q) {
    setSyncedQ(query.q);
    setText(query.q);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  function navigate(next: DocumentListQuery, replace = false) {
    const href = docsHref(workspaceSlug, next);
    startTransition(() => {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  function onSearchChange(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      navigate(patchDocumentListQuery(query, { q: value.trim() }), true);
    }, SEARCH_DEBOUNCE_MS);
  }

  const filtered = isDocumentSearch(query);
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', pending && 'opacity-80')}
      aria-busy={pending || undefined}
    >
      <div className="relative min-w-48 flex-1">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(event) => onSearchChange(event.target.value)}
          maxLength={DOCUMENT_LIST_QUERY_MAX_LENGTH}
          placeholder="Поиск по названию"
          aria-label="Поиск документов по названию"
          className="pl-8"
        />
      </div>
      {tags.length > 0 && (
        <Select
          value={query.tag ?? ALL}
          onValueChange={(value) =>
            navigate(patchDocumentListQuery(query, { tag: value === ALL ? null : value }))
          }
        >
          <SelectTrigger className="w-40" aria-label="Фильтр по тегу">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все теги</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={query.kind ?? ALL}
        onValueChange={(value) =>
          navigate(
            patchDocumentListQuery(query, {
              kind: value === ALL ? null : (value as DocumentKindFilter),
            }),
          )
        }
      >
        <SelectTrigger className="w-40" aria-label="Фильтр по виду">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все виды</SelectItem>
          {DOCUMENT_KIND_FILTERS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {DOCUMENT_KIND_FILTER_LABELS[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={`${query.sort}:${query.dir}`}
        onValueChange={(value) => {
          const [sort, dir] = value.split(':') as [DocumentListSort, 'asc' | 'desc'];
          navigate(patchDocumentListQuery(query, { sort, dir }));
        }}
      >
        <SelectTrigger className="w-48" aria-label="Сортировка">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_LIST_SORTS.flatMap((sort) =>
            (['asc', 'desc'] as const).map((dir) => (
              <SelectItem key={`${sort}:${dir}`} value={`${sort}:${dir}`}>
                {DOCUMENT_LIST_SORT_LABELS[sort]}{' '}
                {sort === 'name'
                  ? dir === 'asc'
                    ? 'А→Я'
                    : 'Я→А'
                  : dir === 'desc'
                    ? '(новые)'
                    : '(старые)'}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
      {filtered && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clearTimeout(timer.current);
            navigate(clearDocumentFilters(query));
          }}
        >
          <XIcon aria-hidden />
          Сбросить
        </Button>
      )}
    </div>
  );
}
