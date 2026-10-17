import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendDueReminders = vi.fn<(options: { now: Date; timeZone: string }) => Promise<unknown>>();
const SECRET = 'cron-secret-value-that-is-long-enough-0123';
let cronSecret: string | undefined = SECRET;

vi.mock('@/shared/env', () => ({
  getEnv: () => ({
    LOG_LEVEL: 'silent',
    CRON_SECRET: cronSecret,
    REMINDERS_TIMEZONE: 'Europe/Moscow',
  }),
}));
vi.mock('@/modules/tasks', () => ({
  sendDueReminders: (options: { now: Date; timeZone: string }) => sendDueReminders(options),
}));

const { POST } = await import('./route');

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/reminders', { method: 'POST', headers });
}

beforeEach(() => {
  vi.resetAllMocks();
  cronSecret = SECRET;
  sendDueReminders.mockResolvedValue({ dueSoon: 2, overdue: 1, skipped: 0, failedBatches: 0 });
});

describe('POST /api/cron/reminders', () => {
  it('is 404 when CRON_SECRET is not configured', async () => {
    cronSecret = undefined;
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(404);
    expect(sendDueReminders).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await POST(request({ authorization: SECRET }))).status).toBe(401);
    expect(sendDueReminders).not.toHaveBeenCalled();
  });

  it('runs reminders with the configured timezone', async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      result: { dueSoon: 2, overdue: 1, skipped: 0, failedBatches: 0 },
    });
    expect(sendDueReminders).toHaveBeenCalledWith({
      now: expect.any(Date),
      timeZone: 'Europe/Moscow',
    });
  });

  it('maps service errors to a safe response', async () => {
    sendDueReminders.mockRejectedValue(new Error('db down'));
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db down');
  });
});
