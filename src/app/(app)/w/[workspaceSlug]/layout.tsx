import { Suspense } from 'react';

import { WorkspaceNav } from '@/components/workspaces/workspace-nav';
import { requireWorkspaceAccessBySlug } from '@/shared/access';

export default function WorkspaceLayout({ children, params }: LayoutProps<'/w/[workspaceSlug]'>) {
  return (
    <main className="mx-auto grid w-full max-w-4xl content-start gap-6 p-6">
      {/* Членство читается за границей Suspense: {children} не ждёт шапку. Страницы проверяют доступ сами. */}
      <Suspense fallback={<div className="h-14 animate-pulse rounded-lg bg-muted" />}>
        <WorkspaceHeader params={params} />
      </Suspense>
      {children}
    </main>
  );
}

async function WorkspaceHeader({ params }: Pick<LayoutProps<'/w/[workspaceSlug]'>, 'params'>) {
  const { workspaceSlug } = await params;
  const { workspace, access } = await requireWorkspaceAccessBySlug(workspaceSlug);
  return <WorkspaceNav slug={workspace.slug} name={workspace.name} role={access.role} />;
}
