'use client';

import { FileSymlinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { searchDocumentsForLinkAction, type LinkedDocumentDto } from '@/modules/documents/client';

import { DocumentIcon } from '../document-icon';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Поиск документов пространства по названию (на сервере). Используется в редакторе («Ссылка на
 * документ») и в задаче («Привязать документ»).
 */
export function useDocumentSearch(
  workspaceId: string,
  open: boolean,
  options: { excludeTaskId?: string } = {},
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkedDocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { excludeTaskId } = options;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchDocumentsForLinkAction({ workspaceId, q: query, taskId: excludeTaskId }).then(
        (result) => {
          if (cancelled) return;
          setLoading(false);
          if (result.ok) {
            setResults(result.data);
            setError(null);
          } else {
            setError(result.error.message);
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspaceId, query, open, excludeTaskId]);

  return { query, setQuery, results, loading, error };
}

/** Список найденных документов внутри `Command`. */
export function DocumentSearchList({
  results,
  loading,
  error,
  onSelect,
}: {
  results: LinkedDocumentDto[];
  loading: boolean;
  error: string | null;
  onSelect: (document: LinkedDocumentDto) => void;
}) {
  return (
    <CommandList>
      <CommandEmpty>{error ?? (loading ? 'Поиск…' : 'Ничего не найдено')}</CommandEmpty>
      {results.length > 0 && (
        <CommandGroup>
          {results.map((document) => (
            <CommandItem key={document.id} value={document.id} onSelect={() => onSelect(document)}>
              <DocumentIcon kind={document.kind} fileKind={document.fileKind} className="size-4" />
              <span className="min-w-0 flex-1 truncate">{document.title}</span>
              {document.folderPath && (
                <span className="max-w-32 truncate text-xs text-muted-foreground">
                  {document.folderPath}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  );
}

/** Кнопка «Ссылка на документ» в панели редактора. */
export function DocumentLinkPicker({
  workspaceId,
  onPick,
}: {
  workspaceId: string;
  onPick: (document: LinkedDocumentDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const search = useDocumentSearch(workspaceId, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
        >
          <FileSymlinkIcon aria-hidden />
          Ссылка на документ
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {/* Фильтрует сервер: встроенный поиск cmdk отключён. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Название документа"
            value={search.query}
            onValueChange={search.setQuery}
          />
          <DocumentSearchList
            results={search.results}
            loading={search.loading}
            error={search.error}
            onSelect={(document) => {
              setOpen(false);
              onPick(document);
            }}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
