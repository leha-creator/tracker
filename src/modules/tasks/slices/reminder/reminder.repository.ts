import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/db';

import type { TaskReminderKind } from '../../models';

const REMINDER_TASK_SELECT = {
  id: true,
  workspaceId: true,
  number: true,
  title: true,
  dueDate: true,
  assigneeId: true,
  watchers: { select: { userId: true } },
  workspace: { select: { slug: true, name: true, taskKey: true } },
} as const satisfies Prisma.TaskSelect;

function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

// Системный срез без сессии: выборка идёт по всем пространствам, поэтому вызывается только из
// route handler с проверенным секретом планировщика.
export const reminderRepository = {
  /**
   * Порция задач для напоминания, по возрастанию id после `cursor`: срок завтра (`due_soon`) или
   * раньше сегодняшнего (`overdue`); не в архиве, пространство не в архиве, есть ответственный,
   * задача открыта (нет размещений или хотя бы в одном проекте статус не «Готово»).
   */
  findCandidates(input: {
    kind: TaskReminderKind;
    today: string;
    tomorrow: string;
    cursor: string | null;
    take: number;
  }) {
    const { kind, today, tomorrow, cursor, take } = input;
    return prisma.task.findMany({
      where: {
        dueDate: kind === 'due_soon' ? dateOnly(tomorrow) : { lt: dateOnly(today) },
        archivedAt: null,
        assigneeId: { not: null },
        workspace: { archivedAt: null },
        OR: [
          { placements: { none: {} } },
          { placements: { some: { status: { category: { not: 'done' } } } } },
        ],
        ...(cursor && { id: { gt: cursor } }),
      },
      orderBy: { id: 'asc' },
      take,
      select: REMINDER_TASK_SELECT,
    });
  },

  /**
   * Отметки «напоминание отправлено». Уже существующие (тот же вид и срок) пропускаются;
   * возвращаются id задач, для которых отметка вставлена сейчас.
   */
  async markSent(
    kind: TaskReminderKind,
    tasks: readonly { id: string; workspaceId: string; dueDate: Date }[],
  ): Promise<Set<string>> {
    if (tasks.length === 0) return new Set();
    const rows = await prisma.taskDueReminder.createManyAndReturn({
      data: tasks.map((task) => ({
        workspaceId: task.workspaceId,
        taskId: task.id,
        kind,
        dueDate: task.dueDate,
      })),
      skipDuplicates: true,
      select: { taskId: true },
    });
    return new Set(rows.map((row) => row.taskId));
  },
};

export type ReminderTaskRow = Awaited<ReturnType<typeof reminderRepository.findCandidates>>[number];
