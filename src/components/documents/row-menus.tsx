'use client';

import {
  DownloadIcon,
  FolderInputIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-react';
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
  deleteFolderAction,
  type DocumentFolderDto,
  type DocumentSummaryDto,
  type TagDto,
} from '@/modules/documents/client';
import type { FormState } from '@/shared/types';

import { documentFileHref } from './docs-href';
import {
  DocumentTagsDialog,
  FolderNameDialog,
  MoveDialog,
  RenameDocumentDialog,
} from './document-dialogs';

/** Подтверждения удаления ждут `FormState` без данных. */
async function deleteFolderForm(prev: FormState, formData: FormData): Promise<FormState> {
  const result = await deleteFolderAction(null, formData);
  return result?.ok ? { ok: true, data: null } : result;
}

async function deleteDocumentForm(prev: FormState, formData: FormData): Promise<FormState> {
  const result = await deleteDocumentAction(null, formData);
  return result?.ok ? { ok: true, data: null } : result;
}

type FolderDialog = 'rename' | 'move' | 'delete' | null;

export function FolderRowMenu({
  workspaceId,
  folder,
  folders,
}: {
  workspaceId: string;
  folder: DocumentFolderDto;
  folders: DocumentFolderDto[];
}) {
  const [dialog, setDialog] = useState<FolderDialog>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Действия с папкой «${folder.name}»`}>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2Icon aria-hidden />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FolderNameDialog
        workspaceId={workspaceId}
        folder={folder}
        open={dialog === 'rename'}
        onOpenChange={close}
      />
      <MoveDialog
        workspaceId={workspaceId}
        folders={folders}
        target={{ type: 'folder', id: folder.id, name: folder.name, parentId: folder.parentId }}
        open={dialog === 'move'}
        onOpenChange={close}
      />
      <ConfirmActionDialog
        action={deleteFolderForm}
        fields={{ workspaceId, folderId: folder.id }}
        title={`Удалить папку «${folder.name}»?`}
        description="Вместе с папкой удалятся все вложенные папки и документы, включая файлы. Отменить удаление нельзя."
        confirmLabel="Удалить папку"
        open={dialog === 'delete'}
        onOpenChange={close}
      />
    </>
  );
}

type DocumentDialog = 'rename' | 'move' | 'tags' | 'delete' | null;

export function DocumentRowMenu({
  workspaceId,
  document,
  folders,
  tags,
  canManage,
}: {
  workspaceId: string;
  document: DocumentSummaryDto;
  folders: DocumentFolderDto[];
  tags: TagDto[];
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<DocumentDialog>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const downloadLabel = document.kind === 'note' ? 'Скачать .md' : 'Скачать';
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Действия с документом «${document.title}»`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem asChild>
            <a href={documentFileHref(document.id)} download>
              <DownloadIcon aria-hidden />
              {downloadLabel}
            </a>
          </DropdownMenuItem>
          {canManage && (
            <>
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
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage && (
        <>
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
            action={deleteDocumentForm}
            fields={{ workspaceId, documentId: document.id }}
            title={`Удалить «${document.title}»?`}
            description="Документ удалится вместе со связями с задачами. Отменить удаление нельзя."
            confirmLabel="Удалить"
            open={dialog === 'delete'}
            onOpenChange={close}
          />
        </>
      )}
    </>
  );
}
