import 'server-only';

import type { TransactionClient } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import { documentTitleKey, normalizeDocumentTitle, normalizeNoteContent } from '../../models';

const log = createLogger('documents.system');

/**
 * Системная заметка, прикреплённая к задаче, — только для integrations/meet (конспект встречи).
 * Права на документы не проверяются: заметку создаёт интеграция от имени организатора созвона,
 * а видит её любой участник, которому видна задача. Доступ организатора к пространству и
 * активность задачи проверяет вызывающий. Работает в транзакции вызывающего; событие журнала
 * `document.created` пишет вызывающий после коммита. Лимит связей задачи не применяется.
 */
export async function createSystemTaskNote(
  tx: TransactionClient,
  input: {
    workspaceId: string;
    taskId: string;
    createdById: string;
    title: string;
    content: string;
  },
): Promise<{ documentId: string; title: string }> {
  const { workspaceId, taskId, createdById } = input;
  const title = normalizeDocumentTitle(input.title);
  const content = normalizeNoteContent(input.content);

  const document = await tx.document.create({
    data: {
      workspaceId,
      folderId: null,
      kind: 'note',
      title,
      titleKey: documentTitleKey(title),
      content,
      createdById,
      updatedById: createdById,
    },
    select: { id: true, title: true },
  });
  await tx.taskDocumentLink.create({
    data: { taskId, documentId: document.id, workspaceId, createdById },
  });
  // Текст заметки не логируем — только длину.
  log.info(
    { workspaceId, taskId, documentId: document.id, userId: createdById, length: content.length },
    '[document] system note created',
  );
  return { documentId: document.id, title: document.title };
}
