import { PageContainer } from '@/components/layout/page-container';

/** Разделы пространства — в шапке приложения. Страницы проверяют доступ сами. */
export default function WorkspaceLayout({ children }: LayoutProps<'/w/[workspaceSlug]'>) {
  return (
    <PageContainer
      as="main"
      id="main-content"
      size="wide"
      className="grid grid-cols-[minmax(0,1fr)] content-start gap-6 py-6"
    >
      {children}
    </PageContainer>
  );
}
