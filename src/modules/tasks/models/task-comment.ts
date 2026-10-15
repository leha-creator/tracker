import type { WorkspaceRole } from '@/shared/access/workspace-role';
import { ForbiddenError } from '@/shared/errors/app-error';

export const TASK_COMMENT_MAX_LENGTH = 5000;
/** Сколько последних комментариев показывать на странице задачи без `?comments=all`. */
export const TASK_COMMENTS_PAGE_SIZE = 50;

interface CommentActor {
  userId: string;
  role: WorkspaceRole;
}

interface CommentAuthorship {
  /** null — автор удалён. */
  authorId: string | null;
}

/**
 * Текст комментария: без пробелов по краям, переводы строк `\n`, пробелы в конце строк убраны,
 * не больше одной пустой строки подряд.
 */
export function normalizeCommentBody(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Редактировать комментарий может только его автор. */
export function canEditComment(comment: CommentAuthorship, actor: CommentActor): boolean {
  return comment.authorId !== null && comment.authorId === actor.userId;
}

export function assertCanEditComment(comment: CommentAuthorship, actor: CommentActor): void {
  if (!canEditComment(comment, actor)) {
    throw new ForbiddenError('Редактировать комментарий может только его автор');
  }
}

/** Удалить комментарий может его автор или владелец пространства. */
export function canDeleteComment(comment: CommentAuthorship, actor: CommentActor): boolean {
  return actor.role === 'owner' || canEditComment(comment, actor);
}

export function assertCanDeleteComment(comment: CommentAuthorship, actor: CommentActor): void {
  if (!canDeleteComment(comment, actor)) {
    throw new ForbiddenError('Удалить комментарий может его автор или владелец пространства');
  }
}
