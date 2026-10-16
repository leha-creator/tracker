import 'server-only';

import { isEntityId } from '@/modules/projects';
import { resolveTaskRefs, resolveTaskRefsByIds, type TaskRefDto } from '@/modules/tasks';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import type { TransactionClient } from '@/shared/db';
import { createLogger } from '@/shared/logger';

import { commitTitle, diffAutoLinks, findTaskReferences, groupReferencesByKey } from '../../models';
import type { TaskBranchesAndCommitsDto } from './link.dto';
import { linkRepository } from './link.repository';

const log = createLogger('github.link');

/** Сколько текста разбирать на ссылки: описание PR может быть огромным. */
const REFERENCE_TEXT_LIMIT = 64 * 1024;

/** Пространство, где репозиторий выбран и задан ключ задач. */
export interface LinkWorkspace {
  id: string;
  slug: string;
  name: string;
  taskKey: string;
}

/** Задача, связанная с событием GitHub, вместе с пространством. */
export interface LinkedTask extends TaskRefDto {
  workspace: LinkWorkspace;
}

/**
 * Задачи по ссылкам `KEY-N` в текстах: только в пространствах, где выбран репозиторий события,
 * и только с ключом этого пространства.
 */
export async function resolveReferencedTasks(
  workspaces: readonly LinkWorkspace[],
  ...texts: (string | null | undefined)[]
): Promise<LinkedTask[]> {
  const references = findTaskReferences(
    ...texts.map((text) => text?.slice(0, REFERENCE_TEXT_LIMIT)),
  );
  if (references.length === 0) return [];
  const byKey = groupReferencesByKey(references);

  const tasks: LinkedTask[] = [];
  for (const workspace of workspaces) {
    const numbers = byKey.get(workspace.taskKey);
    if (!numbers) continue;
    const found = await resolveTaskRefs(workspace.id, numbers);
    tasks.push(...found.map((task) => ({ ...task, workspace })));
  }
  log.debug(
    {
      references: references.map(({ key, number }) => `${key}-${number}`),
      workspaces: workspaces.length,
      tasks: tasks.length,
    },
    '[github.link] references resolved',
  );
  return tasks;
}

export interface PullRequestLinkSync {
  /** Новые автосвязи. */
  added: LinkedTask[];
  /** Все действующие связи после синхронизации (авто и ручные, без отвязанных). */
  active: LinkedTask[];
  removed: number;
}

/**
 * Пересчитывает автосвязи PR по текущим ссылкам: новые создаются, исчезнувшие снимаются.
 * Ручные и отвязанные вручную связи не трогаются.
 */
export async function syncPullRequestLinks(
  tx: TransactionClient,
  input: {
    pullRequestId: bigint;
    workspaces: readonly LinkWorkspace[];
    referenced: readonly LinkedTask[];
  },
): Promise<PullRequestLinkSync> {
  const { pullRequestId } = input;
  // Связи в пространствах, где репозиторий больше не выбран, здесь не видны и не меняются.
  const workspaceIds = new Set(input.workspaces.map((workspace) => workspace.id));
  const current = (await linkRepository.listPullRequestLinks(tx, pullRequestId)).filter((link) =>
    workspaceIds.has(link.workspaceId),
  );
  const referenced = new Map(input.referenced.map((task) => [task.taskId, task]));
  const { add, remove } = diffAutoLinks(
    current.map((link) => ({
      taskId: link.taskId,
      source: link.source,
      dismissed: link.dismissedAt !== null,
    })),
    new Set(referenced.keys()),
  );

  const added = add.map((taskId) => referenced.get(taskId)!);
  await linkRepository.createPullRequestLinks(
    tx,
    added.map((task) => ({
      taskId: task.taskId,
      workspaceId: task.workspace.id,
      pullRequestId,
      source: 'auto',
    })),
  );
  const removed = await linkRepository.deletePullRequestLinks(tx, pullRequestId, remove);

  // Действующие связи: из ссылок + оставшиеся без ссылок (ручные).
  const removedSet = new Set(remove);
  const kept = current.filter((link) => link.dismissedAt === null && !removedSet.has(link.taskId));
  const active = new Map<string, LinkedTask>();
  for (const task of added) active.set(task.taskId, task);
  const missing: { workspaceId: string; taskId: string }[] = [];
  for (const link of kept) {
    const task = referenced.get(link.taskId);
    if (task) active.set(link.taskId, task);
    else missing.push(link);
  }
  for (const workspace of input.workspaces) {
    const ids = missing
      .filter((link) => link.workspaceId === workspace.id)
      .map((link) => link.taskId);
    if (ids.length === 0) continue;
    for (const task of await resolveTaskRefsByIds(workspace.id, ids)) {
      active.set(task.taskId, { ...task, workspace });
    }
  }

  for (const task of added) {
    log.info(
      {
        workspaceId: task.workspace.id,
        taskId: task.taskId,
        pullRequestId: pullRequestId.toString(),
        source: 'auto',
      },
      '[github.link] linked',
    );
  }
  if (removed > 0) {
    log.info({ pullRequestId: pullRequestId.toString(), removed }, '[github.link] unlinked');
  }
  return { added, active: [...active.values()], removed };
}

/** Коммит из push для привязки. */
export interface PushCommit {
  sha: string;
  message: string;
  url: string;
  authorLogin: string | null;
  committedAt: Date;
}

/**
 * Ветка и коммиты push: ссылки в имени ветки привязывают ветку и все коммиты push, ссылки в
 * тексте коммита — только этот коммит. Повторный push дублей не создаёт.
 */
export async function linkPush(
  tx: TransactionClient,
  input: {
    repositoryId: bigint;
    branch: string;
    commits: readonly PushCommit[];
    workspaces: readonly LinkWorkspace[];
  },
): Promise<{ branchTasks: number; commits: number }> {
  const { repositoryId, branch, commits, workspaces } = input;
  const branchTasks = await resolveReferencedTasks(workspaces, branch);
  for (const task of branchTasks) {
    await linkRepository.upsertBranch(tx, {
      taskId: task.taskId,
      workspaceId: task.workspace.id,
      repositoryId,
      name: branch,
    });
    log.info(
      {
        workspaceId: task.workspace.id,
        taskId: task.taskId,
        repositoryId: repositoryId.toString(),
      },
      '[github.link] branch linked',
    );
  }

  // Один запрос задач на все сообщения push, затем раскладка по коммитам.
  const messageTasks = await resolveReferencedTasks(
    workspaces,
    ...commits.map((commit) => commit.message),
  );
  const byKey = new Map(messageTasks.map((task) => [task.key, task]));
  const rows = commits.flatMap((commit) => {
    const tasks = new Map(branchTasks.map((task) => [task.taskId, task]));
    for (const { key, number } of findTaskReferences(commit.message)) {
      const task = byKey.get(`${key}-${number}`);
      if (task) tasks.set(task.taskId, task);
    }
    return [...tasks.values()].map((task) => ({
      taskId: task.taskId,
      workspaceId: task.workspace.id,
      repositoryId,
      sha: commit.sha,
      message: commitTitle(commit.message),
      url: commit.url,
      authorLogin: commit.authorLogin,
      committedAt: commit.committedAt,
    }));
  });
  const created = await linkRepository.createCommits(tx, rows);
  log.debug(
    {
      repositoryId: repositoryId.toString(),
      commits: commits.length,
      referenced: rows.length,
      created,
    },
    '[github.push] commits',
  );
  if (created > 0) {
    log.info(
      { repositoryId: repositoryId.toString(), count: created },
      '[github.link] commits linked',
    );
  }
  return { branchTasks: branchTasks.length, commits: created };
}

/** Ветка создана (событие create): привязать к задачам по ключу в имени. */
export async function linkBranch(
  tx: TransactionClient,
  input: { repositoryId: bigint; branch: string; workspaces: readonly LinkWorkspace[] },
): Promise<number> {
  const tasks = await resolveReferencedTasks(input.workspaces, input.branch);
  for (const task of tasks) {
    await linkRepository.upsertBranch(tx, {
      taskId: task.taskId,
      workspaceId: task.workspace.id,
      repositoryId: input.repositoryId,
      name: input.branch,
    });
  }
  if (tasks.length > 0) {
    log.info(
      { repositoryId: input.repositoryId.toString(), tasks: tasks.length },
      '[github.link] branch linked',
    );
  }
  return tasks.length;
}

/** Ветку удалили: отметить у всех задач. */
export async function markBranchDeleted(
  tx: TransactionClient,
  repositoryId: bigint,
  branch: string,
): Promise<number> {
  const count = await linkRepository.markBranchDeleted(tx, repositoryId, branch);
  if (count > 0) {
    log.info({ repositoryId: repositoryId.toString(), count }, '[github.link] branch deleted');
  }
  return count;
}

/** Ветки и последние коммиты задачи для раздела «GitHub». */
export async function listTaskBranchesAndCommits(
  session: AuthSession,
  workspaceId: string,
  taskId: string,
  options: { commitsLimit: number } = { commitsLimit: 10 },
): Promise<TaskBranchesAndCommitsDto> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!isEntityId(taskId)) return { branches: [], commits: [], commitsTotal: 0 };
  const [branches, commits, commitsTotal] = await Promise.all([
    linkRepository.listBranchesForTask(workspaceId, taskId),
    linkRepository.listCommitsForTask(workspaceId, taskId, options.commitsLimit),
    linkRepository.countCommitsForTask(workspaceId, taskId),
  ]);
  log.debug(
    { workspaceId, taskId, branches: branches.length, commitsTotal },
    '[github.link] branches and commits',
  );
  return {
    branches: branches.map((branch) => ({
      repositoryFullName: branch.repository.fullName,
      name: branch.name,
      deleted: branch.deletedAt !== null,
    })),
    commits: commits.map((commit) => ({
      repositoryFullName: commit.repository.fullName,
      sha: commit.sha,
      message: commit.message,
      url: commit.url,
      authorLogin: commit.authorLogin,
      committedAt: commit.committedAt,
    })),
    commitsTotal,
  };
}
