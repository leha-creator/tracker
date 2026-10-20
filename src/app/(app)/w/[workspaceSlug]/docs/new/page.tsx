import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { DocumentBreadcrumbs } from '@/components/documents/document-breadcrumbs';
import { NoteEditor } from '@/components/documents/note-editor/note-editor';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { folderPath, listFolderTree } from '@/modules/documents';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export const metadata: Metadata = { title: 'Новая заметка — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/docs/new'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function NewNotePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[70dvh] rounded-xl" />}>
      <NewNoteSection params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewNoteSection({ params, searchParams }: Props) {
  const [{ workspaceSlug }, raw] = await Promise.all([params, searchParams]);
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  if (!access.permissions.manageDocuments) notFound();

  const folders = await listFolderTree(session, workspace.id);
  const requestedFolder = first(raw.folder);
  // Неизвестная папка из адреса — создаём в корне (папку проверит и сервис при сохранении).
  const path = requestedFolder ? folderPath(folders, requestedFolder) : [];
  const folderId = path.length > 0 ? (requestedFolder ?? null) : null;
  const linkTask = first(raw.linkTask);
  const linkTaskId = linkTask && UUID_RE.test(linkTask) ? linkTask : undefined;

  return (
    <section className="grid gap-4" aria-labelledby="new-note-heading">
      <div className="grid gap-2">
        <DocumentBreadcrumbs
          workspaceSlug={workspace.slug}
          path={path.map(({ id, name }) => ({ id, name }))}
          current="Новая заметка"
        />
        <PageHeader
          id="new-note-heading"
          title="Новая заметка"
          description={linkTaskId && 'После создания заметка будет привязана к задаче.'}
        />
      </div>
      <NoteEditor
        mode="create"
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        initialTitle=""
        initialContent=""
        folderId={folderId}
        folders={folders}
        linkTaskId={linkTaskId}
      />
    </section>
  );
}
