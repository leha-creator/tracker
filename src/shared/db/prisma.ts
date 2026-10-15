import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, type Prisma } from '@/generated/prisma/client';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

const log = createLogger('db');

/** Запросы дольше порога логируются как WARN. */
export const SLOW_QUERY_THRESHOLD_MS = 200;

export type TransactionClient = Prisma.TransactionClient;

function createPrismaClient() {
  const env = getEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  const client = new PrismaClient({
    adapter,
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // Параметры запросов (e.params) не логируем: в них могут быть персональные данные.
  client.$on('query', (e) => {
    if (e.duration >= SLOW_QUERY_THRESHOLD_MS) {
      log.warn({ durationMs: e.duration, query: e.query }, '[db.query] slow query');
    } else {
      log.debug({ durationMs: e.duration, query: e.query }, '[db.query] query');
    }
  });
  client.$on('warn', (e) => log.warn({ target: e.target }, `[db] ${e.message}`));
  client.$on('error', (e) => log.error({ target: e.target }, `[db] ${e.message}`));

  log.info('[db] prisma client created');
  return client;
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// Singleton через globalThis: HMR в dev не плодит подключения.
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

function getPrismaClient(): ExtendedPrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Prisma-клиент (ленивый): подключение создаётся при первом обращении, а не при импорте. */
export const prisma: ExtendedPrismaClient = new Proxy({} as ExtendedPrismaClient, {
  get(_target, key: string | symbol) {
    const client = getPrismaClient();
    const value: unknown = Reflect.get(client, key, client);
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});
