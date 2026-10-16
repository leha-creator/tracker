import type { NotificationType } from '../../models';

export interface NotificationActorDto {
  userId: string;
  name: string;
  image: string | null;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  /** Что произошло. */
  title: string;
  /** Задача или пространство. */
  subject: string;
  /** Фрагмент комментария; null — нет. */
  excerpt: string | null;
  /** Адрес в приложении. */
  href: string;
  /** Автор действия сейчас; null — удалён (тогда имя — из `actorName`). */
  actor: NotificationActorDto | null;
  /** Имя автора на момент события. */
  actorName: string | null;
  workspaceName: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPageDto {
  items: NotificationDto[];
  /** Курсор следующей страницы; null — страниц больше нет. */
  nextCursor: string | null;
}
