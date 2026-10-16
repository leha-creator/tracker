'use client';

import {
  DownloadIcon,
  FolderInputIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SquarePenIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  deleteDocumentAction,
  type DocumentDto,
  type DocumentFolderDto,
  type TagDto,
} from '@/modules/documents/client';
import type { FormState } from '@/shared/types';

import { documentEditHref, documentFileHref, folderHref } from './docs-href';
import { DocumentTagsDialog, MoveDialog, RenameDocumentDialog } from './document-dialogs';

type Dialog = 'rename' | 'move' | 'tags' | 'delete' | null;

/** Действия в шапке документа: правка заметки, скачивание и (с правом) управление. */
export function DocumentActions({
  document,
  folders,
  tags,
  canManage,
}: {
  document: DocumentDto;
  folders: DocumentFolderDto[];
  tags: TagDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const { workspaceId, workspaceSlug } = document;

  // После удаления — в папку документа (страница самого документа станет 404).
  async function deleteAndLeave(prev: FormState, formData: FormData): Promise<FormState> {
    const result = await deleteDocumentAction(null, formData);
    if (!result?.ok) return result;
    router.replace(folderHref(workspaceSlug, result.data.folderId));
    return { ok: true, data: null };
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && document.kind === 'note' && (
        <Button asChild size="sm">
          <Link href={documentEditHref(workspaceSlug, document.id)}>
            <SquarePenIcon aria-hidden />
            Редактировать
          </Link>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <a href={documentFileHref(document.id)} download>
          <DownloadIcon aria-hidden />
          {document.kind === 'note' ? 'Скачать .md' : 'Скачать'}
        </a>
      </Button>
      {canManage && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Другие действия">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-44">
              <DropdownMenuItem onSelect={() => setDialog('rename')}>
                <PencilIcon aria-hidden />
                Переименовать
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('move')}>
                <FolderInputIcon aria-hidden />
                Переместить
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('tags')}>
                <TagIcon aria-hidden />
                Теги
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                <Trash2Icon aria-hidden />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <RenameDocumentDialog
            workspaceId={workspaceId}
            document={document}
            open={dialog === 'rename'}
            onOpenChange={close}
          />
          <MoveDialog
            workspaceId={workspaceId}
            folders={folders}
            target={{
              type: 'document',
              id: document.id,
              name: document.title,
              folderId: document.folderId,
            }}
            open={dialog === 'move'}
            onOpenChange={close}
          />
          <DocumentTagsDialog
            workspaceId={workspaceId}
            documentId={document.id}
            tags={tags}
            selected={document.tags}
            open={dialog === 'tags'}
            onOpenChange={close}
          />
          <ConfirmActionDialog
            action={deleteAndLeave}
            fields={{ workspaceId, documentId: document.id }}
            title={`Удалить «${document.title}»?`}
            description="Документ удалится вместе со связями с задачами. Отменить удаление нельзя."
            confirmLabel="Удалить"
            open={dialog === 'delete'}
            onOpenChange={close}
          />
        </>
      )}
    </div>
  );
}
