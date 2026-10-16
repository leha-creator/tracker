import 'server-only';

import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { createLogger } from '@/shared/logger';

import { isGithubEnabled } from '../../github-api';
import { summaryRepository } from './summary.repository';

const log = createLogger('github.summary');

/**
 * Что участнику (и его агенту) нужно знать об интеграции пространства: включена ли она,
 * какие репозитории выбраны и какая автосмена статуса настроена. Без установок и секретов.
 */
export interface WorkspaceGithubSummaryDto {
  /** GitHub App создан в Tasker. */
  enabled: boolean;
  repositories: { fullName: string; suspended: boolean }[];
  automations: {
    projectId: string;
    prOpenedStatusId: string | null;
    prMergedStatusId: string | null;
  }[];
}

/** Сводка для любого участника пространства (настройки целиком видит только владелец). */
export async function getWorkspaceGithubSummary(
  session: AuthSession,
  workspaceId: string,
): Promise<WorkspaceGithubSummaryDto> {
  await requireWorkspaceAccess(session, workspaceId);
  if (!(await isGithubEnabled())) {
    log.debug({ workspaceId }, '[github.summary] integration disabled');
    return { enabled: false, repositories: [], automations: [] };
  }

  const [repositories, automations] = await Promise.all([
    summaryRepository.listEnabledRepositories(workspaceId),
    summaryRepository.listAutomations(workspaceId),
  ]);
  log.debug(
    { workspaceId, repositories: repositories.length, automations: automations.length },
    '[github.summary]',
  );
  return {
    enabled: true,
    repositories: repositories.map(({ repository }) => ({
      fullName: repository.fullName,
      suspended: repository.installation.suspendedAt !== null,
    })),
    automations: automations.filter(
      (row) => row.prOpenedStatusId !== null || row.prMergedStatusId !== null,
    ),
  };
}
