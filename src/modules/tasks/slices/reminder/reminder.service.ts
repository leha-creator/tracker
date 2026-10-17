import 'server-only';

import { notify } from '@/modules/notifications';
import { createLogger } from '@/shared/logger';

import {
  formatTaskKey,
  pickReminderRecipients,
  REMINDER_BATCH_SIZE,
  reminderDates,
  TASK_REMINDER_KINDS,
  toIsoDate,
  type TaskReminderKind,
} from '../../models';
import { reminderRepository, type ReminderTaskRow } from './reminder.repository';

const log = createLogger('tasks.reminder');

export interface DueRemindersResult {
  /** Задач, по которым ушло напоминание «срок завтра». */
  dueSoon: number;
  /** Задач, по которым ушло напоминание о просрочке. */
  overdue: number;
  /** Задач, о которых уже напоминали (тот же вид и срок) или напоминать некому. */
  skipped: number;
  /** Порций, которые не удалось обработать (ошибка БД); остальные порции обработаны. */
  failedBatches: number;
}

const NOTIFICATION_TYPE = {
  due_soon: 'task_due_soon',
  overdue: 'task_overdue',
} as const satisfies Record<TaskReminderKind, string>;

/** Уведомления одной задачи. notify не бросает: сбой доставки логируется внутри модуля. */
async function notifyTask(kind: TaskReminderKind, task: ReminderTaskRow): Promise<boolean> {
  const recipients = pickReminderRecipients(
    kind,
    task.assigneeId,
    task.watchers.map((watcher) => watcher.userId),
  );
  if (recipients.length === 0 || !task.dueDate) return false;
  const dueDate = toIsoDate(task.dueDate);
  await notify(
    recipients.map((recipientId) => ({
      type: NOTIFICATION_TYPE[kind],
      recipientId,
      workspaceId: task.workspaceId,
      actorId: null,
      taskId: task.id,
      payload: {
        workspaceSlug: task.workspace.slug,
        workspaceName: task.workspace.name,
        actorName: null,
        taskNumber: task.number,
        taskKey: formatTaskKey(task.number, task.workspace.taskKey),
        taskTitle: task.title,
        dueDate,
      },
    })),
  );
  return true;
}

/** Все порции одного вида напоминаний. Сбой порции не прерывает остальные. */
async function processKind(
  kind: TaskReminderKind,
  dates: { today: string; tomorrow: string },
): Promise<{ sent: number; skipped: number; failedBatches: number }> {
  let cursor: string | null = null;
  let sent = 0;
  let skipped = 0;
  let failedBatches = 0;

  for (;;) {
    const rows: ReminderTaskRow[] = await reminderRepository.findCandidates({
      kind,
      ...dates,
      cursor,
      take: REMINDER_BATCH_SIZE,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    try {
      const withDue = rows.filter(
        (row): row is ReminderTaskRow & { dueDate: Date } => row.dueDate !== null,
      );
      const inserted = await reminderRepository.markSent(kind, withDue);
      let batchSent = 0;
      for (const row of withDue) {
        if (inserted.has(row.id) && (await notifyTask(kind, row))) batchSent += 1;
      }
      sent += batchSent;
      skipped += rows.length - batchSent;
      log.debug(
        { kind, batch: rows.length, inserted: inserted.size, sent: batchSent },
        '[reminders] batch',
      );
    } catch (error) {
      failedBatches += 1;
      log.error({ err: error, kind, batch: rows.length, cursor }, '[reminders] batch failed');
    }

    if (rows.length < REMINDER_BATCH_SIZE) break;
  }
  return { sent, skipped, failedBatches };
}

/**
 * Напоминания о сроке по всем пространствам: «срок завтра» — ответственному, «срок прошёл» —
 * ответственному и наблюдателям, по одному разу на каждое значение срока (повторный запуск в тот
 * же день ничего не шлёт). Системная функция без сессии — только для route handler с проверенным
 * секретом планировщика.
 */
export async function sendDueReminders(options: {
  now: Date;
  timeZone: string;
}): Promise<DueRemindersResult> {
  const startedAt = Date.now();
  const dates = reminderDates(options.now, options.timeZone);
  log.debug({ ...dates, timeZone: options.timeZone }, '[reminders] run started');

  const result: DueRemindersResult = { dueSoon: 0, overdue: 0, skipped: 0, failedBatches: 0 };
  for (const kind of TASK_REMINDER_KINDS) {
    const { sent, skipped, failedBatches } = await processKind(kind, dates);
    if (kind === 'due_soon') result.dueSoon = sent;
    else result.overdue = sent;
    result.skipped += skipped;
    result.failedBatches += failedBatches;
  }

  log.info({ ...result, ...dates, ms: Date.now() - startedAt }, '[reminders] run finished');
  return result;
}
