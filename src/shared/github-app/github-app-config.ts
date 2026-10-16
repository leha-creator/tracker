import 'server-only';

import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import { decryptSecret, encryptSecret } from './secret-box';

const log = createLogger('github.app-config');

/** Как часто перечитывать запись из БД: другой экземпляр приложения мог её изменить. */
const RELOAD_INTERVAL_MS = 60_000;
const CONFIG_ID = 'default';

export interface GithubAppConfig {
  /** `env` — переменные GITHUB_* (важнее), `db` — создано из админки по манифесту. */
  source: 'env' | 'db';
  appId: string;
  slug: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

export interface GithubAppConfigInput {
  appId: number;
  slug: string;
  name: string;
  htmlUrl: string;
  ownerLogin: string | null;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  webhookActive: boolean;
}

/** Публичные сведения о записи в БД — для админки, без секретов. */
export interface StoredGithubAppInfo {
  appId: number;
  slug: string;
  name: string;
  htmlUrl: string;
  ownerLogin: string | null;
  webhookActive: boolean;
  createdAt: Date;
}

interface CacheState {
  config: GithubAppConfig | null;
  loadedAt: number;
  loading?: Promise<void>;
}

// Через globalThis: HMR в dev не сбрасывает кеш. Экземпляр конфига стабилен, пока запись не
// изменилась, — по нему getAuth() и клиент GitHub App понимают, что пора пересоздаться.
const globalForConfig = globalThis as unknown as {
  githubAppConfig?: CacheState;
  githubEnvConfig?: GithubAppConfig | null;
};

function envConfig(): GithubAppConfig | null {
  if (globalForConfig.githubEnvConfig !== undefined) return globalForConfig.githubEnvConfig;
  const env = getEnv();
  const config =
    env.GITHUB_APP_ID &&
    env.GITHUB_APP_SLUG &&
    env.GITHUB_APP_PRIVATE_KEY &&
    env.GITHUB_APP_CLIENT_ID &&
    env.GITHUB_APP_CLIENT_SECRET &&
    env.GITHUB_WEBHOOK_SECRET
      ? {
          source: 'env' as const,
          appId: env.GITHUB_APP_ID,
          slug: env.GITHUB_APP_SLUG,
          privateKey: env.GITHUB_APP_PRIVATE_KEY,
          clientId: env.GITHUB_APP_CLIENT_ID,
          clientSecret: env.GITHUB_APP_CLIENT_SECRET,
          webhookSecret: env.GITHUB_WEBHOOK_SECRET,
        }
      : null;
  globalForConfig.githubEnvConfig = config;
  return config;
}

function sameConfig(a: GithubAppConfig | null, b: GithubAppConfig | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.appId === b.appId &&
    a.slug === b.slug &&
    a.privateKey === b.privateKey &&
    a.clientId === b.clientId &&
    a.clientSecret === b.clientSecret &&
    a.webhookSecret === b.webhookSecret
  );
}

function setCached(config: GithubAppConfig | null) {
  const state = globalForConfig.githubAppConfig;
  // Неизменившийся конфиг — прежний экземпляр, чтобы не пересоздавать зависящие от него клиенты.
  const next = state && sameConfig(state.config, config) ? state.config : config;
  globalForConfig.githubAppConfig = { config: next, loadedAt: Date.now() };
}

async function readFromDb(): Promise<GithubAppConfig | null> {
  const row = await prisma.githubAppConfig.findUnique({ where: { id: CONFIG_ID } });
  if (!row) return null;
  const secret = getEnv().BETTER_AUTH_SECRET;
  try {
    return {
      source: 'db',
      appId: String(row.appId),
      slug: row.slug,
      privateKey: decryptSecret(row.privateKey, secret),
      clientId: row.clientId,
      clientSecret: decryptSecret(row.clientSecret, secret),
      webhookSecret: decryptSecret(row.webhookSecret, secret),
    };
  } catch {
    // Например, сменили BETTER_AUTH_SECRET: запись не расшифровать, интеграция выключена.
    log.error({ appId: row.appId }, '[github.app-config] cannot decrypt stored config');
    return null;
  }
}

/**
 * Загружает конфиг GitHub App: переменные окружения или запись из БД (с кешем на минуту).
 * Вызывать в начале запроса до {@link getGithubAppConfig}. Ошибка БД — прежнее значение кеша.
 */
export async function loadGithubAppConfig(): Promise<GithubAppConfig | null> {
  const fromEnv = envConfig();
  if (fromEnv) return fromEnv;

  const state = globalForConfig.githubAppConfig;
  if (state && Date.now() - state.loadedAt < RELOAD_INTERVAL_MS) return state.config;
  if (state?.loading) {
    await state.loading;
    return getGithubAppConfig();
  }

  const loading = readFromDb()
    .then(setCached)
    .catch((error: unknown) => {
      // Прежнее значение остаётся; следующая попытка — через RELOAD_INTERVAL_MS.
      log.warn({ err: error }, '[github.app-config] load failed');
      globalForConfig.githubAppConfig = { config: state?.config ?? null, loadedAt: Date.now() };
    });
  globalForConfig.githubAppConfig = {
    config: state?.config ?? null,
    loadedAt: state?.loadedAt ?? 0,
    loading,
  };
  await loading;
  return getGithubAppConfig();
}

/**
 * Текущий конфиг GitHub App без обращения к БД: переменные окружения или последнее загруженное
 * {@link loadGithubAppConfig} значение. null — интеграция не настроена.
 */
export function getGithubAppConfig(): GithubAppConfig | null {
  return envConfig() ?? globalForConfig.githubAppConfig?.config ?? null;
}

/** Задан ли GitHub App переменными окружения (тогда запись в БД не используется). */
export function isGithubAppFromEnv(): boolean {
  return envConfig() !== null;
}

/** Сведения о записи в БД без секретов (для админки). */
export async function getStoredGithubAppInfo(): Promise<StoredGithubAppInfo | null> {
  return prisma.githubAppConfig.findUnique({
    where: { id: CONFIG_ID },
    select: {
      appId: true,
      slug: true,
      name: true,
      htmlUrl: true,
      ownerLogin: true,
      webhookActive: true,
      createdAt: true,
    },
  });
}

/** Сохраняет GitHub App в БД (секреты — зашифрованными) и сразу обновляет кеш процесса. */
export async function saveGithubAppConfig(
  input: GithubAppConfigInput,
  createdById: string,
): Promise<void> {
  const secret = getEnv().BETTER_AUTH_SECRET;
  const data = {
    appId: input.appId,
    slug: input.slug,
    name: input.name,
    htmlUrl: input.htmlUrl,
    ownerLogin: input.ownerLogin,
    clientId: input.clientId,
    clientSecret: encryptSecret(input.clientSecret, secret),
    privateKey: encryptSecret(input.privateKey, secret),
    webhookSecret: encryptSecret(input.webhookSecret, secret),
    webhookActive: input.webhookActive,
    createdById,
  };
  await prisma.githubAppConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, ...data },
    update: data,
  });
  setCached(await readFromDb());
  log.info({ appId: input.appId, userId: createdById }, '[github.app-config] saved');
}

/** Удаляет запись из БД и выключает интеграцию в этом процессе (переменные окружения не трогает). */
export async function deleteGithubAppConfig(userId: string): Promise<void> {
  await prisma.githubAppConfig.deleteMany({ where: { id: CONFIG_ID } });
  setCached(null);
  log.info({ userId }, '[github.app-config] deleted');
}
