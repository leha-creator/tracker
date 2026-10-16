import { FolderIcon } from 'lucide-react';
import Link from 'next/link';

import {
  formatBytes,
  type DocumentFolderDto,
  type LinkedDocumentDto,
  type TagDto,
} from '@/modules/documents/client';

import { docsHref, documentHref, folderHref } from './docs-href';
import { DocumentIcon, documentKindLabel } from './document-icon';
import { DocumentRowMenu, FolderRowMenu } from './row-menus';
import { TagBadge } from './tag-badge';

const DATE_FORMAT = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

interface DocumentListProps {
  workspaceId: string;
  workspaceSlug: string;
  folders: DocumentFolderDto[];
  documents: LinkedDocumentDto[];
  /** Режим поиска: у документов видна их папка. */
  isSearch: boolean;
  allFolders: DocumentFolderDto[];
  tags: TagDto[];
  canManage: boolean;
}

/** Подпапки и документы: строки-ссылки с меню действий. */
export function DocumentList({
  workspaceId,
  workspaceSlug,
  folders,
  documents,
  isSearch,
  allFolders,
  tags,
  canManage,
}: DocumentListProps) {
  return (
    <ul className="divide-y rounded-xl border" aria-label="Папки и документы">
      {folders.map((folder) => (
        <li key={folder.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
          <FolderIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <Link
            href={folderHref(workspaceSlug, folder.id)}
            className="min-w-0 flex-1 truncate font-medium focus-visible:underline focus-visible:outline-none"
          >
            {folder.name}
          </Link>
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
            {folder.documentsCount > 0 ? `документов: ${folder.documentsCount}` : 'пусто'}
          </span>
          {canManage && (
            <FolderRowMenu workspaceId={workspaceId} folder={folder} folders={allFolders} />
          )}
        </li>
      ))}
      {documents.map((document) => (
        <li key={document.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
          <DocumentIcon
            kind={document.kind}
            fileKind={document.fileKind}
            className="size-5 shrink-0 text-muted-foreground"
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={documentHref(workspaceSlug, document.id)}
                className="min-w-0 truncate font-medium focus-visible:underline focus-visible:outline-none"
              >
                {document.title}
              </Link>
              {document.tags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  href={docsHref(workspaceSlug, { tag: tag.id })}
                />
              ))}
            </div>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>
                {documentKindLabel(document.kind, document.fileKind)}
                {document.extension && ` · .${document.extension}`}
                {document.size !== null && ` · ${formatBytes(document.size)}`}
              </span>
              {isSearch && (
                <Link
                  href={folderHref(workspaceSlug, document.folderId)}
                  className="hover:underline"
                >
                  в «{document.folderPath || 'Все документы'}»
                </Link>
              )}
              <span>
                изменён {DATE_FORMAT.format(document.updatedAt)}
                {document.updatedBy && ` · ${document.updatedBy.name}`}
              </span>
            </p>
          </div>
          <DocumentRowMenu
            workspaceId={workspaceId}
            document={document}
            folders={allFolders}
            tags={tags}
            canManage={canManage}
          />
        </li>
      ))}
    </ul>
  );
}
