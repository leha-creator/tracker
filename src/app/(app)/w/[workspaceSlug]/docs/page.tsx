import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { DocumentBreadcrumbs } from '@/components/documents/document-breadcrumbs';
import { DocumentList } from '@/components/documents/document-list';
import { DocumentListPagination } from '@/components/documents/document-list-pagination';
import { DocumentListToolbar } from '@/components/documents/document-list-toolbar';
import {
  DocumentDropzone,
  DocumentUploadProvider,
  DocumentUploadQueue,
} from '@/components/documents/document-upload';
import { DocumentsActions } from '@/components/documents/documents-actions';
import {
  listDocuments,
  listFolderTree,
  listTags,
  parseDocumentListParams,
} from '@/modules/documents';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Документы — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/docs'>;

export default function DocumentsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <DocumentsSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DocumentsSection({ params, searchParams }: Props) {
  const [{ workspaceSlug }, raw] = await Promise.all([params, searchParams]);
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const query = parseDocumentListParams(raw);
  const canManage = access.permissions.manageDocuments;

  const [page, folders, tags] = await Promise.all([
    listDocuments(session, workspace.id, query).catch((error: unknown) => {
      // Папка из адреса удалена или из чужого пространства.
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    listFolderTree(session, workspace.id),
    listTags(session, workspace.id),
  ]);
  const shown = { ...query, page: page.page };
  const currentFolder = page.path.at(-1);
  const title = page.isSearch ? 'Поиск документов' : (currentFolder?.name ?? 'Документы');
  const empty = page.folders.length === 0 && page.documents.length === 0;

  return (
    <DocumentUploadProvider workspaceId={workspace.id} folderId={query.folder} enabled={canManage}>
      <section className="grid gap-4" aria-labelledby="documents-heading">
        <div className="grid gap-2">
          {!page.isSearch && page.path.length > 0 && (
            <DocumentBreadcrumbs workspaceSlug={workspace.slug} path={page.path} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 id="documents-heading" className="truncate text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            {canManage && !page.isSearch && (
              <DocumentsActions
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                folderId={query.folder}
                tags={tags}
              />
            )}
          </div>
        </div>
        <DocumentListToolbar workspaceSlug={workspace.slug} query={shown} tags={tags} />
        <DocumentUploadQueue />
        <DocumentDropzone>
          {empty ? (
            <EmptyState isSearch={page.isSearch} canManage={canManage} />
          ) : (
            <DocumentList
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              folders={page.folders}
              documents={page.documents}
              isSearch={page.isSearch}
              allFolders={folders}
              tags={tags}
              canManage={canManage}
            />
          )}
        </DocumentDropzone>
        {page.total > 0 && (
          <DocumentListPagination workspaceSlug={workspace.slug} page={page} query={shown} />
        )}
      </section>
    </DocumentUploadProvider>
  );
}

function EmptyState({ isSearch, canManage }: { isSearch: boolean; canManage: boolean }) {
  return (
    <div className="grid place-items-center gap-1 rounded-xl border border-dashed px-6 py-14 text-center">
      <p className="font-medium">{isSearch ? 'Ничего не найдено' : 'Здесь пока пусто'}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {isSearch
          ? 'Попробуйте другое название или сбросьте фильтры.'
          : canManage
            ? 'Создайте заметку или папку через «Создать» — или перетащите сюда файлы.'
            : 'Документы появятся, когда их добавят участники с правом на документы.'}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-9 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-px overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
