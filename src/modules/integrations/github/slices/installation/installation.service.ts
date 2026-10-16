import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { getEnv } from '@/shared/env';
import { AppError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import {
  callGithub,
  getInstallationClient,
  getUserClient,
  githubInstallUrl,
  isGithubEnabled,
} from '../../github-api';
import { getGithubIdentity, getGithubUserToken } from '../identity/identity.service';
import type {
  AvailableInstallationDto,
  GithubInstallationDto,
  GithubSettingsDto,
} from './installation.dto';
import {
  installationRepository,
  type InstallationData,
  type RepositoryData,
} from './installation.repository';
import { signInstallState, verifyInstallState } from './install-state';

const log = createLogger('github.installation');

/** details.reason ошибки completeInstallation, когда state неверный или просрочен. */
export const INVALID_INSTALL_STATE = 'invalid_install_state';

/** Установка из `GET /user/installations` (нужные поля). */
interface UserInstallation {
  id: number;
  suspended_at?: string | null;
  account: { id: number; login?: string; slug?: string; type?: string } | null;
}

async function requireEnabled(): Promise<void> {
  if (!(await isGithubEnabled())) throw new NotFoundError('Интеграция с GitHub не настроена');
}

function toInstallationData(installation: UserInstallation): InstallationData {
  const account = installation.account;
  return {
    id: BigInt(installation.id),
    accountId: BigInt(account?.id ?? 0),
    accountLogin: account?.login ?? account?.slug ?? `installation-${installation.id}`,
    accountType: account?.type ?? 'Organization',
    suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
  };
}

/** Где на GitHub настроить доступ установки к репозиториям. */
export function installationConfigureUrl(installation: {
  id: string;
  accountLogin: string;
  accountType: string;
}): string {
  return installation.accountType === 'Organization'
    ? `https://github.com/organizations/${encodeURIComponent(installation.accountLogin)}/settings/installations/${installation.id}`
    : `https://github.com/settings/installations/${installation.id}`;
}

/** Установки, доступные пользователю на GitHub (по его токену). */
async function listUserInstallations(userId: string): Promise<UserInstallation[]> {
  const token = await getGithubUserToken(userId);
  return callGithub('GET /user/installations', { userId }, () =>
    getUserClient(token).paginate('GET /user/installations', { per_page: 100 }),
  );
}

/** Репозитории, к которым у установки есть доступ (токеном установки). */
async function listInstallationRepositories(installationId: number): Promise<RepositoryData[]> {
  const client = await callGithub(
    'POST /app/installations/{id}/access_tokens',
    { installationId },
    () => getInstallationClient(installationId),
  );
  const repositories = await callGithub('GET /installation/repositories', { installationId }, () =>
    client.paginate('GET /installation/repositories', { per_page: 100 }),
  );
  return repositories.map((repository) => ({
    id: BigInt(repository.id),
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch ?? null,
  }));
}

/** Настройки GitHub пространства (только владелец). */
export async function getGithubSettings(
  session: AuthSession,
  workspaceId: string,
): Promise<GithubSettingsDto> {
  await requireEnabled();
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const userId = session.user.id;

  const rows = await installationRepository.listForWorkspace(workspaceId);
  const installations: GithubInstallationDto[] = rows.map(({ installation }) => {
    const base = {
      id: installation.id.toString(),
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
    };
    return {
      ...base,
      suspended: installation.suspendedAt !== null,
      configureUrl: installationConfigureUrl(base),
      repositories: installation.repositories.map((repository) => ({
        id: repository.id.toString(),
        fullName: repository.fullName,
        private: repository.private,
        enabled: repository.workspaces.length > 0,
      })),
    };
  });

  const githubLinked = (await getGithubIdentity(userId)) !== null;
  let available: AvailableInstallationDto[] | null = null;
  let availableError: string | null = null;
  if (githubLinked) {
    try {
      const connected = new Set(installations.map((installation) => installation.id));
      available = (await listUserInstallations(userId))
        .map(toInstallationData)
        .filter((installation) => !connected.has(installation.id.toString()))
        .map((installation) => ({
          id: installation.id.toString(),
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
        }));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      availableError = error.message;
    }
  }
  log.debug(
    { workspaceId, userId, installations: installations.length, available: available?.length },
    '[github.installation] settings',
  );
  return { installations, available, githubLinked, availableError };
}

/** Ссылка установки GitHub App с подписанным state. Требует привязанный GitHub. */
export async function startInstallation(
  session: AuthSession,
  input: { workspaceId: string; workspaceSlug: string },
): Promise<string> {
  await requireEnabled();
  await requireWorkspaceAccess(session, input.workspaceId, 'owner');
  if (!(await getGithubIdentity(session.user.id))) {
    throw new ForbiddenError('Сначала привяжите GitHub в профиле');
  }
  const state = signInstallState(
    { workspaceId: input.workspaceId, workspaceSlug: input.workspaceSlug, userId: session.user.id },
    getEnv().BETTER_AUTH_SECRET,
  );
  log.info(
    { workspaceId: input.workspaceId, userId: session.user.id },
    '[github.installation] install started',
  );
  return githubInstallUrl(state);
}

/**
 * Подключает установку к пространству. `installation_id` из запроса не доверенный: установка
 * должна быть в `GET /user/installations` этого пользователя (иначе — чужая установка).
 */
export async function connectInstallation(
  session: AuthSession,
  input: { workspaceId: string; installationId: string },
): Promise<void> {
  await requireEnabled();
  const { workspaceId } = input;
  const userId = session.user.id;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  log.debug(
    { workspaceId, userId, installationId: input.installationId },
    '[github.installation] connect start',
  );

  const installation = (await listUserInstallations(userId)).find(
    (candidate) => String(candidate.id) === input.installationId,
  );
  if (!installation) {
    log.warn(
      { workspaceId, userId, installationId: input.installationId },
      '[github.installation] installation not accessible to user',
    );
    throw new ForbiddenError('Эта установка GitHub App вам недоступна');
  }

  const data = toInstallationData(installation);
  const repositories = await listInstallationRepositories(installation.id);
  const { removed } = await prisma.$transaction(async (tx) => {
    await installationRepository.upsertInstallation(tx, data);
    const result = await installationRepository.syncRepositories(tx, data.id, repositories);
    await installationRepository.linkWorkspace(tx, workspaceId, data.id, userId);
    return result;
  });
  log.info(
    {
      workspaceId,
      userId,
      installationId: input.installationId,
      repositories: repositories.length,
      removed,
    },
    '[github.installation] connected',
  );
}

/**
 * Возврат с GitHub после установки (Setup URL): state → владелец пространства → подключение.
 * Возвращает slug пространства для редиректа.
 */
export async function completeInstallation(
  session: AuthSession,
  input: { installationId: string; setupAction?: string; state: string },
): Promise<{ workspaceSlug: string }> {
  await requireEnabled();
  const verified = verifyInstallState(input.state, session.user.id, getEnv().BETTER_AUTH_SECRET);
  log.debug(
    {
      userId: session.user.id,
      installationId: input.installationId,
      setupAction: input.setupAction,
      valid: verified !== null,
    },
    '[github.installation] setup callback',
  );
  if (!verified) {
    log.warn({ userId: session.user.id }, '[github.installation] invalid or expired state');
    throw new ForbiddenError('Ссылка установки устарела — начните подключение заново', {
      details: { reason: INVALID_INSTALL_STATE },
    });
  }
  await connectInstallation(session, {
    workspaceId: verified.workspaceId,
    installationId: input.installationId,
  });
  return { workspaceSlug: verified.workspaceSlug };
}

/** Отключает установку от пространства (на GitHub она остаётся). */
export async function disconnectInstallation(
  session: AuthSession,
  input: { workspaceId: string; installationId: string },
): Promise<void> {
  await requireWorkspaceAccess(session, input.workspaceId, 'owner');
  const count = await installationRepository.unlinkWorkspace(
    input.workspaceId,
    BigInt(input.installationId),
  );
  if (count === 0) throw new NotFoundError('Установка не подключена к пространству');
  log.info(
    {
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      userId: session.user.id,
    },
    '[github.installation] disconnected',
  );
}

/** Включает репозиторий в пространстве или выключает (связи задач с ним удаляются). */
export async function setRepositoryEnabled(
  session: AuthSession,
  input: { workspaceId: string; repositoryId: string; enabled: boolean },
): Promise<void> {
  const { workspaceId, enabled } = input;
  await requireWorkspaceAccess(session, workspaceId, 'owner');
  const repositoryId = BigInt(input.repositoryId);
  const repository = await installationRepository.findWorkspaceRepository(
    workspaceId,
    repositoryId,
  );
  if (!repository) {
    log.warn(
      { workspaceId, repositoryId: input.repositoryId },
      '[github.repository] not in workspace installations',
    );
    throw new NotFoundError('Репозиторий не найден');
  }
  await installationRepository.setRepositoryEnabled(workspaceId, repositoryId, enabled);
  log.info(
    { workspaceId, repositoryId: input.repositoryId, userId: session.user.id },
    enabled ? '[github.repository] enabled' : '[github.repository] disabled',
  );
}
