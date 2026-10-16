import type { Metadata } from 'next';

import { NotFoundMessage } from '@/components/layout/not-found-message';
import { PageContainer } from '@/components/layout/page-container';

export const metadata: Metadata = { title: 'Страница не найдена — Tasker' };

/** 404 для неизвестных адресов и notFound() вне пространств. Рендерится без шапки приложения. */
export default function NotFound() {
  return (
    <PageContainer as="main" id="main-content" size="wide" className="flex flex-1 items-center">
      <NotFoundMessage primary={{ href: '/', label: 'К пространствам' }} />
    </PageContainer>
  );
}
