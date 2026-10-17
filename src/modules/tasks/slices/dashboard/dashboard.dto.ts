import type { DashboardModel } from '../../models';
import type { TaskListItemDto } from '../task/task.dto';

/** Обзор пространства: счётчики, нагрузка, проекты и ближайшие просроченные задачи. */
export interface WorkspaceDashboardDto extends DashboardModel {
  /** Сегодня в часовом поясе напоминаний, `YYYY-MM-DD`. */
  today: string;
  /** Самые давние просроченные задачи (до `DASHBOARD_OVERDUE_LIMIT`). */
  overdueTasks: TaskListItemDto[];
}
