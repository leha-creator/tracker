'use client';

import { FilePlusIcon, LinkIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Command, CommandInput } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  linkDocumentToTaskAction,
  TASK_DOCUMENT_LINKS_LIMIT,
  unlinkDocumentFromTaskAction,
  type LinkedDocumentDto,
} from '@/modules/documents/client';

import { documentFileHref, documentHref, newNoteHref } from '../docs-href';
import { DocumentIcon } from '../document-icon';
import { DocumentSearchList, useDocumentSearch } from '../note-editor/document-link-picker';
import { TagBadge } from '../tag-badge';

function LinkDocumentPicker({
  workspaceId,
  workspaceSlug,
  taskId,
  canCreate,
  onPick,
}: {
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
  canCreate: boolean;
  onPick: (document: LinkedDocumentDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const search = useDocumentSearch(workspaceId, open, { excludeTaskId: taskId });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <LinkIcon aria-hidden />
          Привязать документ
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
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
        {canCreate && (
          <div className="border-t p-1">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href={newNoteHref(workspaceSlug, { linkTaskId: taskId })}>
                <FilePlusIcon aria-hidden />
                Создать заметку и привязать
              </Link>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Документы задачи: ссылки на страницы документов, привязка из поиска и отвязка. */
export function TaskDocumentsList({
  workspaceId,
  workspaceSlug,
  taskId,
  documents,
  canCreate,
}: {
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
  documents: LinkedDocumentDto[];
  canCreate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const full = documents.length >= TASK_DOCUMENT_LINKS_LIMIT;

  function link(document: LinkedDocumentDto) {
    startTransition(async () => {
      const result = await linkDocumentToTaskAction({
        workspaceId,
        taskId,
        documentId: document.id,
      });
      if (result.ok) toast.success(`«${document.title}» привязан к задаче`);
      else toast.error(result.error.message);
    });
  }

  function unlink(document: LinkedDocumentDto) {
    startTransition(async () => {
      const result = await unlinkDocumentFromTaskAction({
        workspaceId,
        taskId,
        documentId: document.id,
      });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  return (
    <div className="grid gap-2" aria-busy={pending || undefined}>
      <div className="flex items-center justify-between gap-2">
        <h3 id="task-documents-heading" className="text-sm font-semibold">
          Документы{documents.length > 0 && ` (${documents.length})`}
        </h3>
        {!full && (
          <LinkDocumentPicker
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            taskId={taskId}
            canCreate={canCreate}
            onPick={link}
          />
        )}
      </div>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Привяжите спецификацию, макет или заметку — они откроются отсюда.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {documents.map((document) => (
            <li key={document.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-2">
              {document.viewer === 'image' ? (
                // Миниатюра через проверку доступа: next/image здесь не нужен.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={documentFileHref(document.id, { inline: true })}
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                  <DocumentIcon
                    kind={document.kind}
                    fileKind={document.fileKind}
                    className="size-5 text-muted-foreground"
                  />
                </span>
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <Link
                  href={documentHref(workspaceSlug, document.id)}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {document.title}
                </Link>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{document.folderPath || 'Все документы'}</span>
                  {document.tags.slice(0, 3).map((tag) => (
                    <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => unlink(document)}
                disabled={pending}
                aria-label={`Отвязать «${document.title}»`}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
