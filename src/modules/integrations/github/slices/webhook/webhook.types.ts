import type { TransactionClient } from '@/shared/db';

export interface WebhookContext {
  tx: TransactionClient;
  deliveryId: string;
  /**
   * Действие после коммита (уведомления, ревалидация страниц): выполняется до ответа GitHub,
   * ошибка пишется в лог и не откатывает обработку.
   */
  afterCommit: (label: string, task: () => Promise<void> | void) => void;
}

/** Результат обработчика: изменил данные или событие нам не интересно. */
export type WebhookOutcome = 'handled' | 'ignored';

/** Обработчик события: `payload` — разобранный JSON, обработчик сам проверяет его схемой. */
export type WebhookHandler = (payload: unknown, ctx: WebhookContext) => Promise<WebhookOutcome>;
