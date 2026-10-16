'use client';

import { FolderTreeIcon } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { DocumentFolderDto } from '@/modules/documents/client';

import { FolderTree } from './folder-tree';

interface DocumentsNavProps {
  workspaceSlug: string;
  folders: DocumentFolderDto[];
  /** Использование хранилища — под деревом. */
  footer?: ReactNode;
}

/** Активная папка: `?folder=` в обзоре; на странице документа — не определена. */
function useActiveFolder(workspaceSlug: string): string | null | undefined {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname !== `/w/${workspaceSlug}/docs`) return undefined;
  const isSearch = ['q', 'tag', 'kind'].some((key) => searchParams.has(key));
  if (isSearch) return undefined;
  return searchParams.get('folder');
}

/** Дерево папок: колонка слева на широких экранах, выдвижная панель на узких. */
export function DocumentsNav({ workspaceSlug, folders, footer }: DocumentsNavProps) {
  const activeFolderId = useActiveFolder(workspaceSlug);
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto pr-1 lg:grid">
        <FolderTree
          workspaceSlug={workspaceSlug}
          folders={folders}
          activeFolderId={activeFolderId}
        />
        {footer}
      </aside>
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderTreeIcon aria-hidden />
              Папки
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 max-w-[85vw] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Папки</SheetTitle>
              <SheetDescription className="sr-only">
                Дерево папок документов пространства
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 px-4 pb-4">
              <FolderTree
                workspaceSlug={workspaceSlug}
                folders={folders}
                activeFolderId={activeFolderId}
                onNavigate={() => setOpen(false)}
              />
              {footer}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
