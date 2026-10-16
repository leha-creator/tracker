import { listTaskDocuments } from '@/modules/documents';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';

import { TaskDocumentsList } from './task-documents-list';

/**
 * Раздел «Документы» в задаче (панель и страница). Модуль tasks о документах не знает:
 * данные собирает этот компонент слоя UI через публичный API documents.
 */
export async function TaskDocumentsSection({
  session,
  workspaceId,
  workspaceSlug,
  taskId,
}: {
  session: AuthSession;
  workspaceId: string;
  workspaceSlug: string;
  taskId: string;
}) {
  // Членство уже прочитано страницей (cache на запрос) — повторного запроса нет.
  const [access, documents] = await Promise.all([
    requireWorkspaceAccess(session, workspaceId),
    listTaskDocuments(session, workspaceId, taskId),
  ]);
  return (
    <TaskDocumentsList
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      taskId={taskId}
      documents={documents}
      canCreate={access.permissions.manageDocuments}
    />
  );
}
