import { Suspense } from 'react';

import { WorkspaceHotkeys } from '@/components/hotkeys/workspace-hotkeys';
import { PageContainer } from '@/components/layout/page-container';
import { RealtimeProvider } from '@/components/realtime/realtime-provider';
import { TaskNavigationProvider } from '@/components/tasks/task-navigation-context';

/**
 * Разделы пространства — в шапке приложения. Страницы проверяют доступ сами. Реалтайм — одно
 * соединение на пространство для всех его страниц.
 */
export default function WorkspaceLayout({ children }: LayoutProps<'/w/[workspaceSlug]'>) {
  return (
    <RealtimeProvider>
      <TaskNavigationProvider>
        {/* Данные URL (useParams, useSearchParams) — под своей границей Suspense. */}
        <Suspense fallback={null}>
          <WorkspaceHotkeys />
        </Suspense>
        <PageContainer
          as="main"
          id="main-content"
          size="wide"
          className="grid grid-cols-[minmax(0,1fr)] content-start gap-6 py-6"
        >
          {children}
        </PageContainer>
      </TaskNavigationProvider>
    </RealtimeProvider>
  );
}
