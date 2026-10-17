import { beforeEach, describe, expect, it, vi } from 'vitest';

const findCandidates = vi.fn<(input: Record<string, unknown>) => Promise<unknown[]>>();
const markSent = vi.fn<(kind: string, tasks: { id: string }[]) => Promise<Set<string>>>();
const notify = vi.fn<(events: Record<string, unknown>[]) => Promise<void>>();

vi.mock('./reminder.repository', () => ({
  reminderRepository: {
    findCandidates: (input: Record<string, unknown>) => findCandidates(input),
    markSent: (kind: string, tasks: { id: string }[]) => markSent(kind, tasks),
  },
}));
vi.mock('@/modules/notifications', () => ({
  notify: (events: Record<string, unknown>[]) => notify(events),
}));

const { sendDueReminders } = await import('./reminder.service');

const NOW = new Date('2026-10-17T06:00:00.000Z'); // 09:00 в Москве
const OPTIONS = { now: NOW, timeZone: 'Europe/Moscow' };

function task(id: string, dueDate: string, watchers: string[] = []) {
  return {
    id,
    workspaceId: 'ws-1',
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `Задача ${id}`,
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    assigneeId: 'assignee',
    watchers: watchers.map((userId) => ({ userId })),
    workspace: { slug: 'team', name: 'Команда', taskKey: 'TSK' },
  };
}

/** Кандидаты по виду: первая порция — rows, дальше пусто. */
function candidates(byKind: Record<string, unknown[]>) {
  findCandidates.mockImplementation((input) =>
    Promise.resolve(input.cursor === null ? (byKind[input.kind as string] ?? []) : []),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  notify.mockResolvedValue();
  markSent.mockImplementation((_kind, tasks) => Promise.resolve(new Set(tasks.map((t) => t.id))));
});

describe('sendDueReminders', () => {
  it('ищет по датам часового пояса', async () => {
    candidates({});
    await sendDueReminders(OPTIONS);
    expect(findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'due_soon', today: '2026-10-17', tomorrow: '2026-10-18' }),
    );
    expect(findCandidates).toHaveBeenCalledWith(expect.objectContaining({ kind: 'overdue' }));
  });

  it('срок завтра — ответственному, просрочка — ответственному и наблюдателям', async () => {
    candidates({
      due_soon: [task('t1', '2026-10-18', ['w1'])],
      overdue: [task('t2', '2026-10-10', ['w1', 'assignee'])],
    });

    const result = await sendDueReminders(OPTIONS);

    expect(result).toEqual({ dueSoon: 1, overdue: 1, skipped: 0, failedBatches: 0 });
    const [dueSoonEvents, overdueEvents] = notify.mock.calls.map(([events]) => events);
    expect(dueSoonEvents).toEqual([
      expect.objectContaining({
        type: 'task_due_soon',
        recipientId: 'assignee',
        actorId: null,
        taskId: 't1',
        payload: expect.objectContaining({ taskKey: 'TSK-1', dueDate: '2026-10-18' }),
      }),
    ]);
    expect(overdueEvents?.map((event) => [event.type, event.recipientId])).toEqual([
      ['task_overdue', 'assignee'],
      ['task_overdue', 'w1'],
    ]);
  });

  it('повторный запуск: отметка уже есть — уведомление не уходит', async () => {
    candidates({ overdue: [task('t2', '2026-10-10')] });
    markSent.mockResolvedValue(new Set());

    const result = await sendDueReminders(OPTIONS);

    expect(notify).not.toHaveBeenCalled();
    expect(result).toEqual({ dueSoon: 0, overdue: 0, skipped: 1, failedBatches: 0 });
  });

  it('идёт порциями по курсору и останавливается на неполной порции', async () => {
    const full = Array.from({ length: 200 }, (_, i) => task(`t${i + 1}`, '2026-10-18'));
    findCandidates.mockImplementation((input) => {
      if (input.kind !== 'due_soon') return Promise.resolve([]);
      if (input.cursor === null) return Promise.resolve(full);
      if (input.cursor === 't200') return Promise.resolve([task('t201', '2026-10-18')]);
      return Promise.resolve([]);
    });

    const result = await sendDueReminders(OPTIONS);

    expect(result.dueSoon).toBe(201);
    expect(findCandidates).toHaveBeenCalledTimes(3); // 2 порции due_soon + 1 overdue
  });

  it('сбой порции не прерывает остальные', async () => {
    candidates({
      due_soon: [task('t1', '2026-10-18')],
      overdue: [task('t2', '2026-10-10')],
    });
    markSent.mockImplementation((kind, tasks) =>
      kind === 'due_soon'
        ? Promise.reject(new Error('db down'))
        : Promise.resolve(new Set(tasks.map((t) => t.id))),
    );

    const result = await sendDueReminders(OPTIONS);

    expect(result).toEqual({ dueSoon: 0, overdue: 1, skipped: 0, failedBatches: 1 });
  });
});
