import 'server-only';

import { listMembers } from '@/modules/workspaces';
import { requireWorkspaceAccess } from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { getEnv } from '@/shared/env';
import { createLogger } from '@/shared/logger';

import {
  addIsoDays,
  buildDashboard,
  DASHBOARD_OVERDUE_LIMIT,
  DASHBOARD_WEEK_DAYS,
  reminderDates,
} from '../../models';
import { toTaskListItem } from '../task/task.mapper';
import type { WorkspaceDashboardDto } from './dashboard.dto';
import { dashboardRepository } from './dashboard.repository';

const log = createLogger('tasks.dashboard');

const midnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

/**
 * Обзор пространства для любого участника. «Сегодня» — по `REMINDERS_TIMEZONE`, как в
 * напоминаниях: срок хранится датой, и просрочка должна совпадать с письмами.
 */
export async function getWorkspaceDashboard(
  session: AuthSession,
  workspaceId: string,
  now: Date = new Date(),
): Promise<WorkspaceDashboardDto> {
  const started = performance.now();
  await requireWorkspaceAccess(session, workspaceId);
  const { today } = reminderDates(now, getEnv().REMINDERS_TIMEZONE);

  const [rows, members] = await Promise.all([
    dashboardRepository.aggregate(
      workspaceId,
      {
        today: midnight(today),
        weekEnd: midnight(addIsoDays(today, DASHBOARD_WEEK_DAYS - 1)),
        doneSince: new Date(now.getTime() - DASHBOARD_WEEK_DAYS * 24 * 60 * 60 * 1000),
      },
      DASHBOARD_OVERDUE_LIMIT,
    ),
    listMembers(session, workspaceId),
  ]);

  const overdueBy = (list: { id: string | null; count: number }[]) =>
    new Map(list.map((row) => [row.id, row.count]));
  const overdueByAssignee = overdueBy(rows.overdueByAssignee);
  const overdueByProject = overdueBy(rows.overdueByProject);
  const openByProject = overdueBy(rows.openByProject);

  const model = buildDashboard({
    counts: rows.counts,
    members: members.map(({ userId, name, image, isAgent }) => ({ userId, name, image, isAgent })),
    assignees: rows.openByAssignee.map((row) => ({
      assigneeId: row.id,
      open: row.count,
      overdue: overdueByAssignee.get(row.id) ?? 0,
    })),
    projects: rows.projects.map((project) => ({
      projectId: project.id,
      name: project.name,
      open: openByProject.get(project.id) ?? 0,
      overdue: overdueByProject.get(project.id) ?? 0,
    })),
  });

  log.debug(
    {
      workspaceId,
      userId: session.user.id,
      open: model.counts.open,
      overdue: model.counts.overdue,
      members: model.workload.length,
      durationMs: Math.round(performance.now() - started),
    },
    '[tasks.dashboard] built',
  );
  return {
    ...model,
    today,
    overdueTasks: rows.overdueTasks.map((row) => toTaskListItem(row, today)),
  };
}
