'use client';

import {
  ChevronDownIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PlusIcon,
  TagsIcon,
  UploadIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TagDto } from '@/modules/documents/client';

import { newNoteHref } from './docs-href';
import { FolderNameDialog } from './document-dialogs';
import { useDocumentUploadContext } from './document-upload';
import { TagManagerDialog } from './tag-manager-dialog';

interface DocumentsActionsProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Текущая папка: туда создаются заметки, папки и загружаются файлы. */
  folderId: string | null;
  tags: TagDto[];
}

/** «Создать» (заметка, файлы, папка) и «Теги» — только с правом на документы. */
export function DocumentsActions({
  workspaceId,
  workspaceSlug,
  folderId,
  tags,
}: DocumentsActionsProps) {
  const { pickFiles } = useDocumentUploadContext();
  const [folderOpen, setFolderOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setTagsOpen(true)}>
        <TagsIcon aria-hidden />
        Теги
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <PlusIcon aria-hidden />
            Создать
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={newNoteHref(workspaceSlug, { folderId })}>
              <FilePlusIcon aria-hidden />
              Заметка
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={pickFiles}>
            <UploadIcon aria-hidden />
            Загрузить файлы
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setFolderOpen(true)}>
            <FolderPlusIcon aria-hidden />
            Папка
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FolderNameDialog
        workspaceId={workspaceId}
        parentId={folderId}
        open={folderOpen}
        onOpenChange={setFolderOpen}
      />
      <TagManagerDialog
        workspaceId={workspaceId}
        tags={tags}
        open={tagsOpen}
        onOpenChange={setTagsOpen}
      />
    </div>
  );
}
