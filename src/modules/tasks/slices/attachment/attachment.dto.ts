import type { AttachmentKind } from '../../models/task-attachment';
import type { TaskUserDto } from '../task/task.dto';

export interface TaskAttachmentDto {
  id: string;
  fileName: string;
  /** Байты. */
  size: number;
  contentType: string;
  kind: AttachmentKind;
  /** null — загрузивший удалён. */
  uploader: TaskUserDto | null;
  createdAt: Date;
  /** Ссылка скачивания (через проверку доступа). */
  href: string;
  /** Ссылка миниатюры — только для картинок, которые показываются в браузере. */
  previewHref: string | null;
  /** Может ли текущий пользователь удалить (загрузивший или владелец пространства). */
  canDelete: boolean;
}

/** Слот загрузки: форма presigned POST для отправки файла прямо в хранилище. */
export interface AttachmentUploadDto {
  attachmentId: string;
  url: string;
  fields: Record<string, string>;
}
