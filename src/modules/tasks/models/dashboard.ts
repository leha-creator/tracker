/**
 * Обзор пространства: счётчики, нагрузка участников и разбивка по проектам. Агрегаты считает
 * БД; здесь — сборка, сортировка и масштаб полос (чистые функции, без Prisma).
 */

/** Сколько дней считать «на неделе» (сегодня + 6) и «закрыто недавно». */
export const DASHBOARD_WEEK_DAYS = 7;
/** Сколько просроченных задач показывать списком. */
export const DASHBOARD_OVERDUE_LIMIT = 8;

export interface DashboardCounts {
  /** Открытые задачи (не во всех проектах «Готово»), без архива. */
  open: number;
  overdue: number;
  /** Открытые со сроком от сегодня до сегодня + 6 дней. */
  dueWeek: number;
  /** Открытые без ответственного. */
  unassigned: number;
  /** Выполненные за последние 7 дней. */
  doneLast7: number;
}

export interface DashboardMember {
  userId: string;
  name: string;
  image: string | null;
  isAgent: boolean;
}

/** Строка агрегата по ответственному; `assigneeId: null` — не назначены (в нагрузку не идут). */
export interface AssigneeCountRow {
  assigneeId: string | null;
  open: number;
  overdue: number;
}

export interface ProjectCountRow {
  projectId: string;
  name: string;
  open: number;
  overdue: number;
}

export interface WorkloadItem extends DashboardMember {
  open: number;
  overdue: number;
}

export interface DashboardModel {
  counts: DashboardCounts;
  /** Участники: больше просроченных — выше, затем больше открытых, затем по имени. */
  workload: WorkloadItem[];
  /** Проекты: больше открытых — выше, затем по имени. */
  projects: ProjectCountRow[];
  /** Максимум открытых в строке нагрузки или проекта — 100 % ширины полосы (минимум 1). */
  maxBar: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru');

/**
 * Нагрузка — все участники пространства, в том числе без задач (видно, кто свободен).
 * Ответственный, которого уже нет среди участников, в нагрузку не попадает: триггер снимает
 * его с задач при выходе, расхождение — только гонка.
 */
export function buildDashboard(input: {
  counts: DashboardCounts;
  members: readonly DashboardMember[];
  assignees: readonly AssigneeCountRow[];
  projects: readonly ProjectCountRow[];
}): DashboardModel {
  const byAssignee = new Map(
    input.assignees
      .filter((row): row is AssigneeCountRow & { assigneeId: string } => row.assigneeId !== null)
      .map((row) => [row.assigneeId, row]),
  );
  const workload = input.members
    .map((member) => ({
      ...member,
      open: byAssignee.get(member.userId)?.open ?? 0,
      overdue: byAssignee.get(member.userId)?.overdue ?? 0,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || byName(a, b));
  const projects = [...input.projects].sort((a, b) => b.open - a.open || byName(a, b));
  const maxBar = Math.max(
    1,
    ...workload.map((row) => row.open),
    ...projects.map((row) => row.open),
  );
  return { counts: input.counts, workload, projects, maxBar };
}

/** Ширина полосы в процентах; ненулевое значение — не тоньше 2 %, чтобы его было видно. */
export function barPercent(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

/** `YYYY-MM-DD` + дни. */
export function addIsoDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
