import 'server-only';

import { notify, type NotificationEvent } from '@/modules/notifications';
import { resolveTaskRefsByIds } from '@/modules/tasks';
import { isWorkspaceMember } from '@/modules/workspaces';
import { prisma } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import { findUsersByGithubIds } from '../identity/identity.service';
import type { LinkedTask } from '../link/link.service';
import { linkRepository } from '../link/link.repository';
import type { PullRequestChange, ReviewChange } from '../pull-request/pull-request.effects';

const log = createLogger('github.notify');

interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  repositoryFullName: string;
}

/** Автор действия в Tasker по GitHub-аккаунту; имя в тексте — логин GitHub. */
async function resolveActor(
  sender: { id: bigint; login: string } | null,
): Promise<{ actorId: string | null; actorName: string | null }> {
  if (!sender) return { actorId: null, actorName: null };
  const users = await findUsersByGithubIds([sender.id]);
  return { actorId: users.get(sender.id.toString()) ?? null, actorName: `@${sender.login}` };
}

function pullRequestPayload(task: LinkedTask, pr: PullRequestInfo, actorName: string | null) {
  return {
    workspaceSlug: task.workspace.slug,
    workspaceName: task.workspace.name,
    actorName,
    taskNumber: task.number,
    taskTitle: task.title,
    taskKey: task.key,
    repositoryFullName: pr.repositoryFullName,
    pullRequestNumber: pr.number,
    pullRequestTitle: pr.title,
    pullRequestUrl: pr.url,
  };
}

/**
 * Уведомления ответственным: «к задаче привязан PR» (новые связи) и «PR слит» (все связи при
 * слиянии). Автору действия — нет (dedupeRecipients). notify не бросает.
 */
export async function notifyPullRequestChange(change: PullRequestChange): Promise<void> {
  const { actorId, actorName } = await resolveActor(change.sender);
  const events: NotificationEvent[] = [];
  const merged = change.transition === 'merged';

  for (const task of merged ? change.active : change.added) {
    if (!task.assigneeId) continue;
    events.push({
      type: merged ? 'pr_merged' : 'pr_linked',
      recipientId: task.assigneeId,
      workspaceId: task.workspace.id,
      actorId,
      taskId: task.taskId,
      payload: pullRequestPayload(task, change.pullRequest, actorName),
    });
  }
  log.debug(
    {
      type: merged ? 'pr_merged' : 'pr_linked',
      events: events.length,
      pullRequestId: change.pullRequest.id.toString(),
    },
    '[github.notify] recipients',
  );
  // По одному вызову на пространство: notify ведёт контекст (логи) по первому событию.
  const byWorkspace = Map.groupBy(events, (event) => event.workspaceId);
  for (const group of byWorkspace.values()) await notify(group);
}

/**
 * «Ревью вашего PR» — автору PR, если его GitHub привязан к участнику пространства, где PR
 * связан с задачей. Одно уведомление на пространство (по первой связанной задаче).
 */
export async function notifyReview(change: ReviewChange): Promise<void> {
  if (change.pullRequest.authorId === null) return;
  const authors = await findUsersByGithubIds([change.pullRequest.authorId]);
  const authorUserId = authors.get(change.pullRequest.authorId.toString());
  if (!authorUserId) {
    log.debug(
      { pullRequestId: change.pullRequestId.toString() },
      '[github.notify] review: author not linked',
    );
    return;
  }
  const { actorId, actorName } = await resolveActor(change.sender);
  const links = (await linkRepository.listPullRequestLinks(prisma, change.pullRequestId)).filter(
    (link) => link.dismissedAt === null,
  );

  const events: NotificationEvent[] = [];
  for (const workspace of change.workspaces) {
    const taskIds = links
      .filter((link) => link.workspaceId === workspace.id)
      .map((link) => link.taskId);
    if (taskIds.length === 0 || !(await isWorkspaceMember(workspace.id, authorUserId))) continue;
    const [task] = await resolveTaskRefsByIds(workspace.id, taskIds.slice(0, 1));
    if (!task) continue;
    events.push({
      type: 'pr_review',
      recipientId: authorUserId,
      workspaceId: workspace.id,
      actorId,
      taskId: task.taskId,
      payload: {
        ...pullRequestPayload({ ...task, workspace }, change.pullRequest, actorName),
        reviewState: change.reviewState,
      },
    });
  }
  log.debug(
    { type: 'pr_review', events: events.length, pullRequestId: change.pullRequestId.toString() },
    '[github.notify] recipients',
  );
  for (const event of events) await notify([event]);
}
