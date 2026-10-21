import type { TransactionClient } from '@/shared/db';

export interface MeetWebhookContext {
  tx: TransactionClient;
  deliveryId: string;
  /**
   * Действие после коммита (журнал, уведомления, реалтайм): выполняется до ответа meet, ошибка
   * пишется в лог и не откатывает обработку.
   */
  afterCommit: (label: string, task: () => Promise<void> | void) => void;
}

/** Результат обработчика: изменил данные или событие tasker не нужно. */
export type MeetWebhookOutcome = 'handled' | 'ignored';
