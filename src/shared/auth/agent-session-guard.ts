import { createLogger } from '@/shared/logger';

const log = createLogger('auth');

/** Чтение флага агента: в auth.ts — через Prisma, в тестах — мок. */
export type FindIsAgent = (userId: string) => Promise<boolean>;

/**
 * Хук `databaseHooks.session.create.before`: агент пространства не получает сессию.
 * У агента нет Account, поэтому войти паролем или через GitHub он не может; хук закрывает
 * остальные пути (impersonation из админки, будущие провайдеры). `false` — сессия не создаётся.
 */
export async function allowSessionCreation(
  session: { userId: string },
  findIsAgent: FindIsAgent,
): Promise<boolean> {
  const isAgent = await findIsAgent(session.userId);
  if (isAgent) {
    log.warn({ userId: session.userId }, '[auth.hooks] agent session blocked');
    return false;
  }
  return true;
}
