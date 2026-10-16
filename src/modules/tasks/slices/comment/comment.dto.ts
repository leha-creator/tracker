import type { TaskAttachmentDto } from '../attachment/attachment.dto';
import type { TaskUserDto } from '../task/task.dto';

export interface TaskCommentDto {
  id: string;
  /** Простой текст: выводить как текст, переводы строк — через `white-space: pre-wrap`. */
  body: string;
  /** null — автор удалён. */
  author: TaskUserDto | null;
  createdAt: Date;
  /** null — не редактировался. */
  editedAt: Date | null;
  /** Может ли текущий пользователь редактировать (только автор). */
  canEdit: boolean;
  /** Может ли текущий пользователь удалить (автор или владелец пространства). */
  canDelete: boolean;
  /** Файлы комментария, от старых к новым. */
  attachments: TaskAttachmentDto[];
}

export interface TaskCommentsDto {
  /** От старых к новым. */
  items: TaskCommentDto[];
  /** Всего комментариев у задачи. */
  total: number;
  /** Показаны не все (только последние). */
  truncated: boolean;
}
