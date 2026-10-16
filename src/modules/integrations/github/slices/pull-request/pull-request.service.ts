import 'server-only';

import { isEntityId } from '@/modules/projects';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type { TransactionClient } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import {
  aggregateChecksState,
  pickBadgeState,
  toPullRequestState,
  type PullRequestState,
} from '../../models';
import { isGithubEnabled } from '../../github-api';
import type { LinkWorkspace } from '../link/link.service';
import type { PullRequestPayload, RepositoryPayload } from '../webhook/webhook.schema';
import { webhookRepository } from '../webhook/webhook.repository';
import type { PullRequestBadgesDto, TaskPullRequestDto } from './pull-request.dto';
import { pullRequestRepository } from './pull-request.repository';

const log = createLogger('github.pr');

/** Сколько задач за раз принимает запрос индикаторов (страница доски или списка). */
const BADGES_TASKS_LIMIT = 1000;

/**
 * Пространства, для которых обрабатывать событие репозитория: установка не приостановлена,
 * репозиторий выбран владельцем, у пространства есть ключ задач. Пусто — событие игнорируется
 * (данные невыбранных репозиториев не сохраняем). Заодно обновляет имя репозитория.
 */
export async function loadRepositoryWorkspaces(
  tx: TransactionClient,
  event: { installation?: { id: number }; repository: RepositoryPayload },
): Promise<LinkWorkspace[]> {
  const repositoryId = BigInt(event.repository.id);
  if (
    event.installation &&
    (await webhookRepository.isInstallationSuspended(BigInt(event.installation.id)))
  ) {
    log.debug({ repositoryId: repositoryId.toString() }, '[github.pr] installation suspended');
    return [];
  }
  const workspaces = await pullRequestRepository.listRepositoryWorkspaces(tx, repositoryId);
  if (workspaces.length > 0) {
    await pullRequestRepository.updateRepositoryInfo(tx, {
      id: repositoryId,
      fullName: event.repository.full_name,
      private: event.repository.private,
      defaultBranch: event.repository.default_branch,
    });
  }
  return workspaces;
}

export interface StoredPullRequest {
  id: bigint;
  previousState: PullRequestState | null;
  state: PullRequestState;
}

/**
 * Сохраняет PR из вебхука или API. Событие старше сохранённого (updated_at) не применяется —
 * возвращает null. При новом коммите итог CI пересчитывается по сохранённым check suites.
 */
export async function storePullRequest(
  tx: TransactionClient,
  repositoryId: bigint,
  pr: PullRequestPayload,
): Promise<StoredPullRequest | null> {
  const id = BigInt(pr.id);
  const githubUpdatedAt = new Date(pr.updated_at);
  const previous = await pullRequestRepository.findPullRequest(tx, id);
  if (previous && githubUpdatedAt < previous.githubUpdatedAt) {
    log.debug(
      { repositoryId: repositoryId.toString(), number: pr.number },
      '[github.pr] stale event skipped',
    );
    return null;
  }

  const state = toPullRequestState(pr);
  const suites = await pullRequestRepository.listCheckSuites(tx, repositoryId, pr.head.sha);
  await pullRequestRepository.upsertPullRequest(tx, {
    id,
    repositoryId,
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    authorId: pr.user ? BigInt(pr.user.id) : null,
    authorLogin: pr.user?.login ?? null,
    checksState: aggregateChecksState(suites),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    githubUpdatedAt,
  });
  log.info(
    {
      repositoryId: repositoryId.toString(),
      number: pr.number,
      state,
      previous: previous?.state ?? null,
    },
    '[github.pr] upserted',
  );
  return { id, previousState: previous?.state ?? null, state };
}

/** PR задачи для раздела «GitHub» (без отвязанных вручную). */
export async function listTaskPullRequests(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
): Promise<TaskPullRequestDto[]> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) return [];
  const rows = await pullRequestRepository.listForTask(workspaceId, taskId);
  log.debug({ workspaceId, taskId, count: rows.length }, '[github.pr] list for task');
  return rows.map(({ source, pullRequest }) => ({
    id: pullRequest.id.toString(),
    repositoryFullName: pullRequest.repository.fullName,
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    state: pullRequest.state,
    reviewState: pullRequest.reviewState,
    checksState: pullRequest.checksState,
    authorLogin: pullRequest.authorLogin,
    source,
    mergedAt: pullRequest.mergedAt,
    updatedAt: pullRequest.githubUpdatedAt,
  }));
}

/** Индикаторы PR для карточек доски и строк списка: одно «главное» состояние и число PR. */
export async function getPullRequestBadges(
  session: AuthSession,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<PullRequestBadgesDto> {
  // Без настроенного GitHub App PR нет — страницы вызывают функцию без проверок.
  if (!(await isGithubEnabled())) return {};
  await requireWorkspaceAccess(session, workspaceId);
  const ids = [...new Set(taskIds)].filter(isEntityId).slice(0, BADGES_TASKS_LIMIT);
  if (ids.length === 0) return {};
  const rows = await pullRequestRepository.listStatesForTasks(workspaceId, ids);

  const states = new Map<string, PullRequestState[]>();
  for (const row of rows) {
    const list = states.get(row.taskId) ?? [];
    list.push(row.pullRequest.state);
    states.set(row.taskId, list);
  }
  const badges: PullRequestBadgesDto = {};
  for (const [taskId, list] of states) {
    const state = pickBadgeState(list);
    if (state) badges[taskId] = { state, count: list.length };
  }
  log.debug({ workspaceId, tasks: ids.length, withPr: states.size }, '[github.pr] badges');
  return badges;
}
