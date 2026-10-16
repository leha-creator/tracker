import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ViaAgentBadge } from '@/components/agents/via-agent-badge';
import { docsHref } from '@/components/documents/docs-href';
import { DocumentActions } from '@/components/documents/document-actions';
import { DocumentBreadcrumbs } from '@/components/documents/document-breadcrumbs';
import { documentKindLabel } from '@/components/documents/document-icon';
import { DocumentTasks } from '@/components/documents/document-tasks';
import { MarkdownView } from '@/components/documents/markdown/markdown-view';
import { TagBadge } from '@/components/documents/tag-badge';
import {
  FileFallback,
  InlineFileViewer,
  TextFileViewer,
  TruncatedNotice,
} from '@/components/documents/viewers/file-viewers';
import { pickViewer } from '@/components/documents/viewers/pick-viewer';
import {
  folderPath,
  formatBytes,
  getDocument,
  getDocumentText,
  listDocumentTasks,
  listFolderTree,
  listTags,
} from '@/modules/documents';
import { requireWorkspaceAccessBySlug } from '@/shared/access';
import { NotFoundError } from '@/shared/errors';

export const metadata: Metadata = { title: 'Документ — Tasker' };

type Props = PageProps<'/w/[workspaceSlug]/docs/[documentId]'>;

const DATE_FORMAT = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function DocumentPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-[70dvh] animate-pulse rounded-xl bg-muted" />}>
      <DocumentSection params={params} />
    </Suspense>
  );
}

function notFoundOnMissing(error: unknown): never {
  if (error instanceof NotFoundError) notFound();
  throw error;
}

async function DocumentSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug, documentId } = await params;
  const { session, workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const canManage = access.permissions.manageDocuments;

  const document = await getDocument(session, workspace.id, documentId).catch(notFoundOnMissing);
  const choice = pickViewer(document);
  const [folders, tags, tasks, text] = await Promise.all([
    listFolderTree(session, workspace.id),
    canManage ? listTags(session, workspace.id) : Promise.resolve([]),
    listDocumentTasks(session, workspace.id, document.id),
    choice.kind === 'text' ? getDocumentText(session, workspace.id, document.id) : null,
  ]);
  const path = document.folderId ? folderPath(folders, document.folderId) : [];

  return (
    <article className="grid gap-6" aria-labelledby="document-heading">
      <header className="grid gap-3">
        <DocumentBreadcrumbs
          workspaceSlug={workspace.slug}
          path={path.map(({ id, name }) => ({ id, name }))}
          current={document.title}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-2">
            <h1 id="document-heading" className="text-2xl font-semibold tracking-tight break-words">
              {document.title}
            </h1>
            {document.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {document.tags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    href={docsHref(workspace.slug, { tag: tag.id })}
                  />
                ))}
              </div>
            )}
          </div>
          <DocumentActions
            document={document}
            folders={folders}
            tags={tags}
            canManage={canManage}
          />
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Вид:</dt>
            <dd className="text-foreground">
              {documentKindLabel(document.kind, document.fileKind)}
              {document.extension && ` (.${document.extension})`}
            </dd>
          </div>
          {document.size !== null && (
            <div className="flex gap-1.5">
              <dt>Размер:</dt>
              <dd className="text-foreground tabular-nums">{formatBytes(document.size)}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt>Создан:</dt>
            <dd className="text-foreground">
              {DATE_FORMAT.format(document.createdAt)}
              {document.createdBy && `, ${document.createdBy.name}`}
              {document.createdVia && (
                <ViaAgentBadge via={document.createdVia} className="ml-1.5" />
              )}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Изменён:</dt>
            <dd className="text-foreground">
              {DATE_FORMAT.format(document.updatedAt)}
              {document.updatedBy && `, ${document.updatedBy.name}`}
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-3">
        {choice.kind === 'note' &&
          (document.content?.trim() ? (
            <div className="rounded-lg border bg-card px-6 py-5">
              <MarkdownView source={document.content} />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
              Заметка пустая.
            </p>
          ))}
        {choice.kind === 'inline' && (
          <InlineFileViewer document={document} viewer={choice.viewer} />
        )}
        {choice.kind === 'text' && text && (
          <>
            {text.truncated && <TruncatedNotice documentId={document.id} />}
            <TextFileViewer viewer={choice.viewer} text={text.text} />
          </>
        )}
        {choice.kind === 'fallback' && <FileFallback document={document} />}
      </div>

      <DocumentTasks
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        documentId={document.id}
        tasks={tasks}
      />
    </article>
  );
}
