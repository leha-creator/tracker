import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { documentHref } from '@/components/documents/docs-href';
import { DocumentBreadcrumbs } from '@/components/documents/document-breadcrumbs';
import { NoteEditor } from '@/components/documents/note-editor/note-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { folderPath, getDocument, listFolderTree } from '@/modules/documents';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Редактирование заметки — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/docs/[documentId]/edit'>;

export default function EditNotePage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-[70dvh] rounded-xl" />}>
      <EditNoteSection params={params} />
    </Suspense>
  );
}

async function EditNoteSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, documentId } = await params;
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  if (!access.permissions.manageDocuments) notFound();

  const [document, folders] = await Promise.all([
    getDocument(session, workspace.id, documentId).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    listFolderTree(session, workspace.id),
  ]);
  // Файлы не редактируются — только заметки.
  if (document.kind !== 'note') redirect(documentHref(workspace.slug, document.id));

  const path = document.folderId ? folderPath(folders, document.folderId) : [];
  return (
    <section className="grid gap-4" aria-labelledby="edit-note-heading">
      <div className="grid gap-2">
        <DocumentBreadcrumbs
          workspaceSlug={workspace.slug}
          path={path.map(({ id, name }) => ({ id, name }))}
          current={document.title}
        />
        <h1 id="edit-note-heading" className="sr-only">
          Редактирование «{document.title}»
        </h1>
      </div>
      <NoteEditor
        mode="edit"
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        documentId={document.id}
        version={document.version}
        initialTitle={document.title}
        initialContent={document.content ?? ''}
        folderId={document.folderId}
        folders={folders}
      />
    </section>
  );
}
