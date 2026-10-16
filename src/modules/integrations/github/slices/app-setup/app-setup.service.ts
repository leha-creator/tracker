import 'server-only';

import { randomBytes } from 'node:crypto';

import { Octokit } from 'octokit';

import { requireAdmin } from '@/shared/access';
import { getEnv } from '@/shared/env';
import { ConflictError, ForbiddenError, InternalError } from '@/shared/errors';
import {
  deleteGithubAppConfig,
  getStoredGithubAppInfo,
  isGithubAppFromEnv,
  saveGithubAppConfig,
} from '@/shared/github-app';
import { createLogger } from '@/shared/logger';

import { callGithub } from '../../github-api';
import {
  buildAppManifest,
  isLocalBaseUrl,
  manifestFormUrl,
  signManifestState,
  verifyManifestState,
} from './app-manifest';
import type { GithubAppSetupDto } from './app-setup.dto';
import { startAppManifestSchema, type StartAppManifestInput } from './app-setup.schema';

const log = createLogger('github.app-setup');

/** Причина ошибки неверного state (для кода ошибки на странице админки). */
export const INVALID_MANIFEST_STATE = 'invalid_manifest_state';

/** Состояние GitHub App для админки (только администратор ресурса). */
export async function getGithubAppSetup(): Promise<GithubAppSetupDto> {
  await requireAdmin();
  const baseUrl = getEnv().BETTER_AUTH_URL;
  const local = isLocalBaseUrl(baseUrl);
  if (isGithubAppFromEnv()) return { source: 'env', app: null, baseUrl, local };
  const stored = await getStoredGithubAppInfo();
  if (!stored) return { source: null, app: null, baseUrl, local };
  return {
    source: 'db',
    baseUrl,
    local,
    app: {
      appId: stored.appId,
      name: stored.name,
      slug: stored.slug,
      htmlUrl: stored.htmlUrl,
      ownerLogin: stored.ownerLogin,
      webhookActive: stored.webhookActive,
      createdAt: stored.createdAt.toISOString(),
    },
  };
}

/**
 * Начало создания GitHub App по манифесту: адрес формы GitHub и манифест. Браузер отправляет
 * манифест POST-ом на GitHub, тот после подтверждения вернёт на redirect_url с `code` и `state`.
 */
export async function startGithubAppManifest(
  raw: StartAppManifestInput,
): Promise<{ formUrl: string; manifest: string }> {
  const session = await requireAdmin();
  if (isGithubAppFromEnv()) {
    throw new ConflictError('GitHub App задан переменными окружения GITHUB_*');
  }
  const input = startAppManifestSchema.parse(raw);
  const env = getEnv();
  const manifest = buildAppManifest({
    baseUrl: env.BETTER_AUTH_URL,
    name: input.name,
    isPublic: input.isPublic,
  });
  const state = signManifestState(session.user.id, env.BETTER_AUTH_SECRET);
  log.info(
    { userId: session.user.id, owner: input.owner, isPublic: input.isPublic },
    '[github.app-setup] manifest started',
  );
  return {
    formUrl: manifestFormUrl(input.organization, state),
    manifest: JSON.stringify(manifest),
  };
}

interface ManifestConversion {
  id: number;
  slug?: string;
  name: string;
  html_url: string;
  owner?: { login?: string } | null;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
}

/**
 * Возврат с GitHub после создания приложения: обмен `code` на ключи (код одноразовый, живёт час)
 * и сохранение. Сразу после этого владельцы пространств могут устанавливать приложение.
 */
export async function completeGithubAppManifest(input: {
  code: string;
  state: string;
}): Promise<void> {
  const session = await requireAdmin();
  const env = getEnv();
  if (!verifyManifestState(input.state, session.user.id, env.BETTER_AUTH_SECRET)) {
    log.warn({ userId: session.user.id }, '[github.app-setup] invalid state');
    throw new ForbiddenError('Ссылка устарела. Начните создание приложения заново', {
      details: { reason: INVALID_MANIFEST_STATE },
    });
  }
  if (isGithubAppFromEnv()) {
    throw new ConflictError('GitHub App задан переменными окружения GITHUB_*');
  }

  // Без авторизации: code сам по себе доказывает, что приложение только что создано.
  const { data } = await callGithub(
    'POST /app-manifests/{code}/conversions',
    { userId: session.user.id },
    () =>
      new Octokit().request('POST /app-manifests/{code}/conversions', {
        code: input.code,
      }) as Promise<{
        data: ManifestConversion;
      }>,
  );
  if (!data.slug) throw new InternalError('GitHub не вернул slug приложения');

  // Без вебхука (localhost) GitHub секрет не выдаёт: свой, чтобы конфиг был полным.
  const webhookSecret = data.webhook_secret ?? randomBytes(32).toString('hex');
  await saveGithubAppConfig(
    {
      appId: data.id,
      slug: data.slug,
      name: data.name,
      htmlUrl: data.html_url,
      ownerLogin: data.owner?.login ?? null,
      clientId: data.client_id,
      clientSecret: data.client_secret,
      privateKey: data.pem,
      webhookSecret,
      webhookActive: data.webhook_secret !== null,
    },
    session.user.id,
  );
  log.info(
    { userId: session.user.id, appId: data.id, webhook: data.webhook_secret !== null },
    '[github.app-setup] app created',
  );
}

/**
 * Отключает GitHub App, созданное в админке: запись с ключами удаляется, интеграция и вход через
 * GitHub выключаются. Само приложение на GitHub и данные установок в Tasker остаются.
 */
export async function deleteGithubApp(): Promise<void> {
  const session = await requireAdmin();
  if (isGithubAppFromEnv()) {
    throw new ConflictError('GitHub App задан переменными окружения GITHUB_*');
  }
  await deleteGithubAppConfig(session.user.id);
}
