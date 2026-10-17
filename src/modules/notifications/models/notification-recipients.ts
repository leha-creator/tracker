import type { NotificationPayloadMap } from './notification-payload';
import type { NotificationType } from './notification-type';

/** Событие для одного получателя: что произошло, где и с какими данными. */
export type NotificationEvent = {
  [T in NotificationType]: {
    type: T;
    recipientId: string;
    workspaceId: string;
    /** Автор действия; ему самому уведомление не отправляется. */
    actorId: string | null;
    taskId?: string | null;
    commentId?: string | null;
    invitationId?: string | null;
    payload: NotificationPayloadMap[T];
  };
}[NotificationType];

/** Чем меньше, тем важнее: при нескольких событиях одному получателю остаётся важнейшее. */
const TYPE_PRIORITY: Record<NotificationType, number> = {
  mention: 0,
  task_assigned: 1,
  task_comment: 2,
  workspace_invitation: 3,
  pr_review: 4,
  pr_merged: 5,
  pr_linked: 6,
  task_status_changed: 7,
  task_overdue: 8,
  task_due_soon: 9,
};

/**
 * События одного действия (комментарий, назначение): автор действия исключается, каждому
 * получателю — одно уведомление, самое важное (упоминание важнее комментария к задаче).
 * Порядок получателей — как в первом появлении.
 */
export function dedupeRecipients(events: readonly NotificationEvent[]): NotificationEvent[] {
  const byRecipient = new Map<string, NotificationEvent>();
  for (const event of events) {
    if (event.actorId !== null && event.recipientId === event.actorId) continue;
    const current = byRecipient.get(event.recipientId);
    if (!current || TYPE_PRIORITY[event.type] < TYPE_PRIORITY[current.type]) {
      byRecipient.set(event.recipientId, event);
    }
  }
  return [...byRecipient.values()];
}
