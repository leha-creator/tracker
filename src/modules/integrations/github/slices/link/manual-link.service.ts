import 'server-only';

import { resolveTaskRefsByIds } from '@/modules/tasks';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { prisma } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { callGithub, getInstallationClient, isGithubEnabled } from '../../github-api';
import { storePullRequest } from '../pull-request/pull-request.service';
import { pullRequestSchema } from '../webhook/webhook.schema';
import { linkRepository } from './link.repository';

const log = createLogger('github.link');

function requireEnabled(): void {
  if (!isGithubEnabled()) throw new NotFoundError('Интеграция с GitHub не настроена');
}

async function requireTask(workspaceId: string, taskId: string): Promise<void> {
  const [task] = await resolveTaskRefsByIds(workspaceId, [taskId]);
  if (!task) throw new NotFoundError('Задача не найдена');
}

/**
 * Привязывает PR по ссылке. Репозиторий должен быть выбран в этом пространстве; PR загружается
 * токеном установки и сохраняется так же, как из вебхука. Связь — ручная: автоматика её не снимет.
 */
export async function linkPullRequestByUrl(
  session: AuthSession,
  input: {
    workspaceId: string;
    taskId: string;
    url: { owner: string; repo: string; number: number };
  },
): Promise<void> {
  requireEnabled();
  const { workspaceId, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  await requireTask(workspaceId, taskId);

  const fullName = `${input.url.owner}/${input.url.repo}`;
  const repository = await linkRepository.findWorkspaceRepositoryByName(workspaceId, fullName);
  if (!repository) {
    log.warn({ workspaceId, taskId }, '[github.link] manual link: repository not in workspace');
    throw new ValidationError('Этот репозиторий не подключён к пространству', {
      fieldErrors: { url: ['Репозиторий не подключён к пространству — см. настройки GitHub'] },
    });
  }

  const installationId = Number(repository.installationId);
  const [owner, repo] = repository.fullName.split('/') as [string, string];
  const response = await callGithub(
    'GET /repos/{owner}/{repo}/pulls/{pull_number}',
    { installationId, repositoryId: repository.id.toString(), number: input.url.number },
    async () =>
      (await getInstallationClient(installationId)).request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}',
        { owner, repo, pull_number: input.url.number },
      ),
  ).catch((error: unknown) => {
    if (error instanceof NotFoundError) {
      throw new ValidationError('PR не найден', { fieldErrors: { url: ['PR не найден'] } });
    }
    throw error;
  });
  const pr = pullRequestSchema.parse(response.data);

  await prisma.$transaction(async (tx) => {
    await storePullRequest(tx, repository.id, pr);
    await linkRepository.upsertManualLink(tx, {
      taskId,
      workspaceId,
      pullRequestId: BigInt(pr.id),
    });
  });
  log.info(
    { workspaceId, taskId, pullRequestId: String(pr.id), userId: session.user.id },
    '[github.link] linked manually',
  );
}

/** Отвязать PR от задачи (любой участник). */
export async function dismissPullRequest(
  session: AuthSession,
  input: { workspaceId: string; taskId: string; pullRequestId: string },
): Promise<void> {
  const { workspaceId, taskId } = input;
  await requireWorkspaceAccess(session, workspaceId);
  const count = await linkRepository.dismissLink(workspaceId, taskId, BigInt(input.pullRequestId));
  if (count === 0) throw new NotFoundError('PR не привязан к задаче');
  log.info(
    { workspaceId, taskId, pullRequestId: input.pullRequestId, userId: session.user.id },
    '[github.link] dismissed',
  );
}
