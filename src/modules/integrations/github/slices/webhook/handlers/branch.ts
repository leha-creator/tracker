import 'server-only';

import { createLogger } from '@/shared/logger';

import { linkBranch, linkPush, markBranchDeleted } from '../../link/link.service';
import { scheduleWorkspaceRevalidation } from '../../pull-request/pull-request.effects';
import { loadRepositoryWorkspaces } from '../../pull-request/pull-request.service';
import { pushEventSchema, refEventSchema } from '../webhook.schema';
import type { WebhookHandler } from '../webhook.types';

const log = createLogger('github.webhook.branch');

const BRANCH_REF_PREFIX = 'refs/heads/';

/**
 * `push`: ветка `refs/heads/*` (теги игнорируются). Удаление ветки отмечает её у задач.
 * GitHub кладёт в payload не больше 20 коммитов — остальные в API не запрашиваем.
 */
export const handlePush: WebhookHandler = async (payload, ctx) => {
  const event = pushEventSchema.parse(payload);
  if (!event.ref.startsWith(BRANCH_REF_PREFIX)) return 'ignored';
  const branch = event.ref.slice(BRANCH_REF_PREFIX.length);
  const workspaces = await loadRepositoryWorkspaces(ctx.tx, event);
  if (workspaces.length === 0) return 'ignored';
  const repositoryId = BigInt(event.repository.id);

  if (event.deleted) {
    const count = await markBranchDeleted(ctx.tx, repositoryId, branch);
    if (count > 0) scheduleWorkspaceRevalidation(ctx);
    return 'handled';
  }

  const result = await linkPush(ctx.tx, {
    repositoryId,
    branch,
    workspaces,
    commits: event.commits.map((commit) => ({
      sha: commit.id,
      message: commit.message,
      url: commit.url,
      authorLogin: commit.author?.username ?? commit.author?.name ?? null,
      committedAt: new Date(commit.timestamp),
    })),
  });
  log.debug(
    {
      repositoryId: repositoryId.toString(),
      pushed: event.commits.length,
      branchTasks: result.branchTasks,
      linkedCommits: result.commits,
    },
    '[github.push] handled',
  );
  if (result.branchTasks > 0 || result.commits > 0) scheduleWorkspaceRevalidation(ctx);
  return result.branchTasks > 0 || result.commits > 0 ? 'handled' : 'ignored';
};

/** `create`: новая ветка с ключом задачи в имени. */
export const handleCreate: WebhookHandler = async (payload, ctx) => {
  const event = refEventSchema.parse(payload);
  if (event.ref_type !== 'branch') return 'ignored';
  const workspaces = await loadRepositoryWorkspaces(ctx.tx, event);
  if (workspaces.length === 0) return 'ignored';
  const linked = await linkBranch(ctx.tx, {
    repositoryId: BigInt(event.repository.id),
    branch: event.ref,
    workspaces,
  });
  if (linked === 0) return 'ignored';
  scheduleWorkspaceRevalidation(ctx);
  return 'handled';
};

/** `delete`: ветку удалили. */
export const handleDelete: WebhookHandler = async (payload, ctx) => {
  const event = refEventSchema.parse(payload);
  if (event.ref_type !== 'branch') return 'ignored';
  const workspaces = await loadRepositoryWorkspaces(ctx.tx, event);
  if (workspaces.length === 0) return 'ignored';
  const count = await markBranchDeleted(ctx.tx, BigInt(event.repository.id), event.ref);
  if (count === 0) return 'ignored';
  scheduleWorkspaceRevalidation(ctx);
  return 'handled';
};
