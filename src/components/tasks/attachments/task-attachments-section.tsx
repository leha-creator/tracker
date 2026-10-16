import { listTaskAttachments } from '@/modules/tasks';
import type { AuthSession } from '@/shared/auth';

import { AttachmentDropzone } from './attachment-dropzone';
import { AttachmentItem } from './attachment-item';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

interface TaskAttachmentsSectionProps {
  session: AuthSession;
  workspaceId: string;
  taskId: string;
}

/** Блок «Вложения» страницы задачи. Подписи с датами форматируются здесь, на сервере. */
export async function TaskAttachmentsSection({
  session,
  workspaceId,
  taskId,
}: TaskAttachmentsSectionProps) {
  const attachments = await listTaskAttachments(session, workspaceId, taskId);

  return (
    <>
      <h3 id="task-attachments-heading" className="font-medium">
        Вложения{attachments.length > 0 && ` (${attachments.length})`}
      </h3>
      <AttachmentDropzone
        workspaceId={workspaceId}
        taskId={taskId}
        target="task"
        existingCount={attachments.length}
      >
        {attachments.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {attachments.map(({ createdAt, ...attachment }) => (
              <AttachmentItem
                key={attachment.id}
                workspaceId={workspaceId}
                taskId={taskId}
                attachment={attachment}
                meta={[attachment.uploader?.name, DATE_TIME.format(createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </ul>
        )}
      </AttachmentDropzone>
    </>
  );
}
