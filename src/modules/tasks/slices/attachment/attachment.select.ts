import 'server-only';

import type { Prisma } from '@/generated/prisma/client';

/** Поля вложения для DTO и проверок прав. */
export const ATTACHMENT_SELECT = {
  id: true,
  workspaceId: true,
  taskId: true,
  target: true,
  commentId: true,
  uploaderId: true,
  fileName: true,
  contentType: true,
  size: true,
  storageKey: true,
  status: true,
  createdAt: true,
  uploader: { select: { id: true, name: true, image: true } },
} as const satisfies Prisma.TaskAttachmentSelect;

/** Готовые файлы комментария — для ленты комментариев. */
export const COMMENT_ATTACHMENTS_SELECT = {
  where: { status: 'ready' },
  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  select: ATTACHMENT_SELECT,
} as const satisfies Prisma.TaskComment$attachmentsArgs;

export type AttachmentRow = Prisma.TaskAttachmentGetPayload<{
  select: typeof ATTACHMENT_SELECT;
}>;
