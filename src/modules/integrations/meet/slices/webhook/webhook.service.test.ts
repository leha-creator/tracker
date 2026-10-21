import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signTaskContext, type TaskContext } from '../../models';

const CONTEXT_SECRET = 'c'.repeat(32);
const repo = {
  findTask: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  findByMeetId: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  upsertMeeting: vi.fn<(...args: unknown[]) => Promise<{ id: string; created: boolean }>>(),
  markEnded: vi.fn<(...args: unknown[]) => Promise<number>>(),
  findRecapByMeetId: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  createRecap: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(),
  recordDelivery: vi.fn<(...args: unknown[]) => Promise<void>>(),
  forgetDelivery: vi.fn<(...args: unknown[]) => Promise<void>>(),
  purgeDeliveriesBefore: vi.fn<(...args: unknown[]) => Promise<number>>(),
};
const findUsersByIdpSubjects = vi.fn<(subs: string[]) => Promise<Map<string, unknown>>>();
const isWorkspaceMember = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const createSystemTaskNote = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const recordAuditEvent = vi.fn<(...args: unknown[]) => Promise<void>>();
const notify = vi.fn<(...args: unknown[]) => Promise<void>>();
const emitTaskEvent = vi.fn<(...args: unknown[]) => Promise<void>>();
const listWatcherIds = vi.fn<(...args: unknown[]) => Promise<string[]>>();

vi.mock('@/shared/env', () => ({
  getEnv: () => ({ LOG_LEVEL: 'silent' }),
  env: {
    MEET_ENABLED: true,
    MEET_URL: 'https://meet.plwedding.ru',
    MEET_CONTEXT_SECRET: 'c'.repeat(32),
    MEET_WEBHOOK_SECRET: 'w'.repeat(32),
    REMINDERS_TIMEZONE: 'Europe/Moscow',
  },
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => run({}) },
  isUniqueViolation: (error: unknown) => (error as { code?: string }).code === 'P2002',
}));
vi.mock('@/shared/idp', () => ({
  findUsersByIdpSubjects: (subs: string[]) => findUsersByIdpSubjects(subs),
}));
vi.mock('@/shared/audit', () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
}));
vi.mock('@/modules/workspaces', () => ({
  isWorkspaceMember: (...args: unknown[]) => isWorkspaceMember(...args),
}));
vi.mock('@/modules/documents', () => ({
  createSystemTaskNote: (...args: unknown[]) => createSystemTaskNote(...args),
}));
vi.mock('@/modules/notifications', () => ({ notify: (...args: unknown[]) => notify(...args) }));
vi.mock('@/modules/tasks', () => ({
  emitTaskEvent: (...args: unknown[]) => emitTaskEvent(...args),
  listWatcherIds: (...args: unknown[]) => listWatcherIds(...args),
  formatTaskKey: (number: number, key: string | null) => (key ? `${key}-${number}` : `#${number}`),
}));
vi.mock('../meeting/meeting.repository', () => ({ meetingRepository: repo }));

const { handleMeetWebhook } = await import('./webhook.service');

const TASK_ID = '0193a000-0000-7000-8000-000000000042';
const JTI = '0193a000-0000-7000-8000-000000000001';
const DELIVERY = '0193a000-0000-7000-8000-0000000000d1';
const now = () => Math.floor(Date.now() / 1000);

const task = {
  id: TASK_ID,
  number: 42,
  title: 'Макет',
  archivedAt: null,
  assigneeId: 'assignee-1',
  workspace: { id: 'ws-1', slug: 'team', name: 'Команда', taskKey: 'TSK', archivedAt: null },
};

function context(overrides: Partial<TaskContext> = {}): string {
  return signTaskContext(
    {
      v: 1,
      iss: 'tasker',
      aud: 'meet',
      jti: JTI,
      sub: 'sub-host',
      workspaceId: 'ws-1',
      workspaceName: 'Команда',
      taskId: TASK_ID,
      taskKey: 'TSK-42',
      taskTitle: 'Макет',
      taskUrl: 'https://tracker.plwedding.ru/w/team/tasks/42',
      iat: now(),
      exp: now() + 600,
      ...overrides,
    },
    CONTEXT_SECRET,
  );
}

const created = (overrides: Record<string, unknown> = {}) => ({
  meetingId: 'm-1',
  code: 'abc-defg-hij',
  url: 'https://meet.plwedding.ru/abc-defg-hij',
  hostSub: 'sub-host',
  createdAt: '2026-10-21T12:00:00.000Z',
  ctx: context(),
  ...overrides,
});

const recap = {
  meetingId: 'm-1',
  recapId: 'r-1',
  completedAt: '2026-10-21T13:05:00.000Z',
  summary: {
    overview: 'Итоги',
    actionItems: [{ owner: 'Анна', task: 'Макет', due: '2026-10-28' }],
  },
};

const run = (event: 'meeting.created' | 'meeting.ended' | 'recap.ready', payload: unknown) =>
  handleMeetWebhook({ event, deliveryId: DELIVERY, payload });

beforeEach(() => {
  vi.resetAllMocks();
  repo.recordDelivery.mockResolvedValue();
  repo.forgetDelivery.mockResolvedValue();
  repo.purgeDeliveriesBefore.mockResolvedValue(0);
  repo.findTask.mockResolvedValue(task);
  repo.upsertMeeting.mockResolvedValue({ id: 'tm-1', created: true });
  repo.findByMeetId.mockResolvedValue({
    id: 'tm-1',
    workspaceId: 'ws-1',
    taskId: TASK_ID,
    url: 'https://meet.plwedding.ru/abc-defg-hij',
    hostUserId: 'host-1',
  });
  repo.findRecapByMeetId.mockResolvedValue(null);
  repo.createRecap.mockResolvedValue({ id: 'tr-1' });
  findUsersByIdpSubjects.mockResolvedValue(new Map([['sub-host', { id: 'host-1', name: 'Хост' }]]));
  isWorkspaceMember.mockResolvedValue(true);
  createSystemTaskNote.mockResolvedValue({ documentId: 'doc-1', title: 'Встреча — TSK-42' });
  listWatcherIds.mockResolvedValue(['watcher-1', 'host-1']);
  notify.mockResolvedValue();
  recordAuditEvent.mockResolvedValue();
  emitTaskEvent.mockResolvedValue();
});

describe('handleMeetWebhook', () => {
  it('rejects a payload outside the contract before recording the delivery', async () => {
    await expect(run('meeting.created', { meetingId: 'm-1' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repo.recordDelivery).not.toHaveBeenCalled();
  });

  it('answers duplicate for a repeated delivery', async () => {
    repo.recordDelivery.mockRejectedValueOnce({ code: 'P2002' });
    await expect(run('meeting.created', created())).resolves.toBe('duplicate');
    expect(repo.upsertMeeting).not.toHaveBeenCalled();
  });

  it('forgets the delivery when the handler fails', async () => {
    repo.upsertMeeting.mockRejectedValueOnce(new Error('db down'));
    await expect(run('meeting.created', created())).rejects.toThrow('db down');
    expect(repo.forgetDelivery).toHaveBeenCalledWith(DELIVERY);
  });
});

describe('meeting.created', () => {
  it('links the meeting to the task from the signed context', async () => {
    await expect(run('meeting.created', created())).resolves.toBe('handled');
    expect(repo.upsertMeeting).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: 'ws-1',
        taskId: TASK_ID,
        meetMeetingId: 'm-1',
        hostUserId: 'host-1',
        contextJti: JTI,
      }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'meeting.started', workspaceId: 'ws-1' }),
    );
    expect(emitTaskEvent).toHaveBeenCalledWith(null, expect.objectContaining({ taskId: TASK_ID }));
  });

  it('ignores a forged context, another host, an outsider and an archived task', async () => {
    const [payload] = context().split('.');
    const forged = `${payload}.${context().split('.')[1]?.slice(1)}A`;
    await expect(run('meeting.created', created({ ctx: forged }))).resolves.toBe('ignored');
    await expect(run('meeting.created', created({ hostSub: 'sub-other' }))).resolves.toBe(
      'ignored',
    );
    isWorkspaceMember.mockResolvedValueOnce(false);
    await expect(run('meeting.created', created())).resolves.toBe('ignored');
    repo.findTask.mockResolvedValueOnce({ ...task, archivedAt: new Date() });
    await expect(run('meeting.created', created())).resolves.toBe('ignored');
    expect(repo.upsertMeeting).not.toHaveBeenCalled();
  });

  it('ignores a context older than a day', async () => {
    const old = context({ iat: now() - 90_000, exp: now() - 89_400 });
    await expect(run('meeting.created', created({ ctx: old }))).resolves.toBe('ignored');
  });

  it('ignores the same meeting twice without a second audit event', async () => {
    repo.upsertMeeting.mockResolvedValueOnce({ id: 'tm-1', created: false });
    await expect(run('meeting.created', created())).resolves.toBe('ignored');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('meeting.ended', () => {
  it('marks a known meeting and ignores an unknown one', async () => {
    repo.markEnded.mockResolvedValueOnce(1);
    await expect(
      run('meeting.ended', { meetingId: 'm-1', endedAt: '2026-10-21T13:00:00.000Z' }),
    ).resolves.toBe('handled');
    repo.findByMeetId.mockResolvedValueOnce(null);
    await expect(
      run('meeting.ended', { meetingId: 'm-2', endedAt: '2026-10-21T13:00:00.000Z' }),
    ).resolves.toBe('ignored');
  });
});

describe('recap.ready', () => {
  it('saves the note as the host, stores action items and notifies', async () => {
    await expect(run('recap.ready', recap)).resolves.toBe('handled');
    expect(createSystemTaskNote).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ workspaceId: 'ws-1', taskId: TASK_ID, createdById: 'host-1' }),
    );
    expect(repo.createRecap).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        meetRecapId: 'r-1',
        documentId: 'doc-1',
        actionItems: [{ owner: 'Анна', task: 'Макет', due: '2026-10-28', subtaskId: null }],
      }),
    );
    const events = notify.mock.calls[0]?.[0] as { recipientId: string; actorId: null }[];
    expect(events.map((event) => event.recipientId)).toEqual([
      'host-1',
      'assignee-1',
      'watcher-1',
      'host-1',
    ]);
    expect(events.every((event) => event.actorId === null)).toBe(true);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'meeting.summary_added' }),
    );
  });

  it('ignores an unknown meeting, a saved recap, an archived task and a host without access', async () => {
    repo.findByMeetId.mockResolvedValueOnce(null);
    await expect(run('recap.ready', recap)).resolves.toBe('ignored');
    repo.findRecapByMeetId.mockResolvedValueOnce({ id: 'tr-1' });
    await expect(run('recap.ready', recap)).resolves.toBe('ignored');
    repo.findTask.mockResolvedValueOnce({
      ...task,
      workspace: { ...task.workspace, archivedAt: new Date() },
    });
    await expect(run('recap.ready', recap)).resolves.toBe('ignored');
    isWorkspaceMember.mockResolvedValueOnce(false);
    await expect(run('recap.ready', recap)).resolves.toBe('ignored');
    expect(createSystemTaskNote).not.toHaveBeenCalled();
  });
});
