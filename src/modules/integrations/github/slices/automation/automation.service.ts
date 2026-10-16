import 'server-only';

import { listStatuses } from '@/modules/projects';
import { changePlacementStatusBySystem, listPlacementsForAutomation } from '@/modules/tasks';
import { requireWorkspacePermission } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ValidationError } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

import { shouldAutomate, type PullRequestState, type PullRequestTransition } from '../../models';
import type { LinkedTask } from '../link/link.service';
import type { UpdateProjectAutomationInput } from './automation.schema';
import { automationRepository } from './automation.repository';

const log = createLogger('github.automation');

export interface ProjectAutomationDto {
  prOpenedStatusId: string | null;
  prMergedStatusId: string | null;
}

/** Настройка автосмены статуса проекта (право «Управление проектами»). */
export async function getProjectAutomation(
  session: AuthSession,
  workspaceId: string,
  projectId: string,
): Promise<ProjectAutomationDto> {
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  const row = await automationRepository.findForProject(workspaceId, projectId);
  return {
    prOpenedStatusId: row?.prOpenedStatusId ?? null,
    prMergedStatusId: row?.prMergedStatusId ?? null,
  };
}

export async function updateProjectAutomation(
  session: AuthSession,
  input: UpdateProjectAutomationInput,
): Promise<void> {
  const { workspaceId, projectId } = input;
  await requireWorkspacePermission(session, workspaceId, 'manageProjects');
  // listStatuses проверяет, что проект есть в пространстве; статусы — только этого проекта.
  const statusIds = new Set(
    (await listStatuses(session, workspaceId, projectId)).map((status) => status.id),
  );
  for (const [field, statusId] of [
    ['prOpenedStatusId', input.prOpenedStatusId],
    ['prMergedStatusId', input.prMergedStatusId],
  ] as const) {
    if (statusId !== null && !statusIds.has(statusId)) {
      log.warn({ workspaceId, projectId, field }, '[github.automation] status of another project');
      throw new ValidationError('Выберите статус этого проекта', {
        fieldErrors: { [field]: ['Выберите статус этого проекта'] },
      });
    }
  }
  await automationRepository.upsert(workspaceId, projectId, {
    prOpenedStatusId: input.prOpenedStatusId,
    prMergedStatusId: input.prMergedStatusId,
  });
  log.info({ workspaceId, projectId, userId: session.user.id }, '[github.automation] updated');
}

/** Переход PR для только что привязанной задачи: PR уже открыт или слит. */
function transitionForState(state: PullRequestState): PullRequestTransition | null {
  if (state === 'open') return 'opened';
  if (state === 'merged') return 'merged';
  return null;
}

/**
 * Автосмена статуса по событию PR. Задачи: все действующие связи при переходе PR и новые связи
 * по текущему состоянию PR. Для каждого размещения в проекте с настройкой — только вперёд по
 * категории (shouldAutomate). Сбой одного размещения не останавливает остальные.
 */
export async function applyPullRequestAutomation(change: {
  transition: PullRequestTransition | null;
  state: PullRequestState;
  active: readonly LinkedTask[];
  added: readonly LinkedTask[];
}): Promise<number> {
  const targets = new Map<string, { task: LinkedTask; transition: PullRequestTransition }>();
  if (change.transition) {
    for (const task of change.active) {
      targets.set(task.taskId, { task, transition: change.transition });
    }
  }
  const addedTransition = transitionForState(change.state);
  if (addedTransition) {
    for (const task of change.added) {
      if (!targets.has(task.taskId))
        targets.set(task.taskId, { task, transition: addedTransition });
    }
  }
  if (targets.size === 0) return 0;

  // Задачи по пространствам: размещения и настройки читаются в рамках пространства.
  const byWorkspace = new Map<string, { task: LinkedTask; transition: PullRequestTransition }[]>();
  for (const target of targets.values()) {
    const list = byWorkspace.get(target.task.workspace.id) ?? [];
    list.push(target);
    byWorkspace.set(target.task.workspace.id, list);
  }

  let applied = 0;
  for (const [workspaceId, list] of byWorkspace) {
    const transitions = new Map(list.map(({ task, transition }) => [task.taskId, transition]));
    const placements = await listPlacementsForAutomation(workspaceId, [...transitions.keys()]);
    if (placements.length === 0) continue;
    const settings = new Map(
      (
        await automationRepository.listForProjects(workspaceId, [
          ...new Set(placements.map((placement) => placement.projectId)),
        ])
      ).map((row) => [row.projectId, row]),
    );

    for (const placement of placements) {
      const setting = settings.get(placement.projectId);
      const transition = transitions.get(placement.taskId)!;
      const target = transition === 'opened' ? setting?.prOpenedStatus : setting?.prMergedStatus;
      // Статус удалили (SetNull) или он из другого проекта (ручная правка БД) — пропускаем.
      if (!target || target.projectId !== placement.projectId) continue;
      const apply = shouldAutomate({
        currentStatusId: placement.statusId,
        currentCategory: placement.category,
        targetStatusId: target.id,
        targetCategory: target.category,
      });
      log.debug(
        {
          workspaceId,
          taskId: placement.taskId,
          projectId: placement.projectId,
          from: placement.statusId,
          target: target.id,
          transition,
          apply,
        },
        '[github.automation] evaluated',
      );
      if (!apply) continue;
      try {
        const changed = await changePlacementStatusBySystem({
          workspaceId,
          taskId: placement.taskId,
          projectId: placement.projectId,
          statusId: target.id,
          reason: transition === 'opened' ? 'github_pr_opened' : 'github_pr_merged',
        });
        if (changed) {
          applied += 1;
          log.info(
            {
              workspaceId,
              taskId: placement.taskId,
              projectId: placement.projectId,
              to: target.id,
            },
            '[github.automation] applied',
          );
        }
      } catch (error) {
        log.error(
          { err: error, workspaceId, taskId: placement.taskId, projectId: placement.projectId },
          '[github.automation] apply failed',
        );
      }
    }
  }
  return applied;
}
