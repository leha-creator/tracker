import { ValidationError } from '@/shared/errors';

import { AGENTS_PER_WORKSPACE_LIMIT } from './agent';

/** Лимит включённых агентов: при создании и повторном включении. Только для сервера. */
export function assertAgentLimit(activeCount: number): void {
  if (activeCount >= AGENTS_PER_WORKSPACE_LIMIT) {
    throw new ValidationError(
      `Не больше ${AGENTS_PER_WORKSPACE_LIMIT} агентов в пространстве. Отключите ненужных.`,
    );
  }
}
