import 'server-only';

import type { WorkspaceAccess } from '@/shared/access';

import { attachmentTypeOf, canDeleteAttachment } from '../../models';
import { toUserDto } from '../task/task.mapper';
import type { TaskAttachmentDto } from './attachment.dto';
import type { AttachmentRow } from './attachment.select';

export function attachmentHref(attachmentId: string, inline = false): string {
  return `/api/attachments/${attachmentId}${inline ? '?inline=1' : ''}`;
}

export function toAttachmentDto(row: AttachmentRow, access: WorkspaceAccess): TaskAttachmentDto {
  const type = attachmentTypeOf(row.contentType);
  return {
    id: row.id,
    fileName: row.fileName,
    size: row.size,
    contentType: row.contentType,
    kind: type.kind,
    uploader: toUserDto(row.uploader),
    createdAt: row.createdAt,
    href: attachmentHref(row.id),
    previewHref: type.previewable ? attachmentHref(row.id, true) : null,
    canDelete: canDeleteAttachment(row, access),
  };
}
