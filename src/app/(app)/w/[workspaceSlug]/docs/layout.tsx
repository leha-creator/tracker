import { Suspense } from 'react';

import { DocumentsNav } from '@/components/documents/documents-nav';
import { StorageUsage } from '@/components/documents/storage-usage';
import { Skeleton } from '@/components/ui/skeleton';
import { getWorkspaceStorageUsage, listFolderTree } from '@/modules/documents';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

type Props = LayoutProps<'/w/[workspaceSlug]/docs'>;

/**
 * Раздел «Документы»: дерево папок слева (на узких экранах — кнопка «Папки») и содержимое.
 * Доступ проверяют и layout, и каждая страница.
 */
export default function DocsLayout({ params, children }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
      <Suspense fallback={<NavSkeleton />}>
        <DocsNavSection params={params} />
      </Suspense>
      <div className="grid min-w-0 content-start gap-6">{children}</div>
    </div>
  );
}

async function DocsNavSection({ params }: Pick<Props, 'params'>) {
  const { workspaceSlug } = await params;
  const { session, workspace } = await requireWorkspaceAccessBySlug(workspaceSlug);
  const [folders, usage] = await Promise.all([
    listFolderTree(session, workspace.id),
    getWorkspaceStorageUsage(session, workspace.id),
  ]);
  return (
    <DocumentsNav
      workspaceSlug={workspace.slug}
      folders={folders}
      footer={<StorageUsage usage={usage} />}
    />
  );
}

function NavSkeleton() {
  return (
    <div className="hidden gap-2 lg:grid" aria-hidden>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-7" />
      ))}
    </div>
  );
}
