import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const purgeExpiredAuditEvents =
  vi.fn<
    (input: { now: Date; retentionDays: number }) => Promise<{ deleted: number; cutoff: Date }>
  >();
const purgeExpiredRateLimits = vi.fn<(now: Date) => Promise<number>>();
const SECRET = 'cron-secret-value-that-is-long-enough-0123';
let cronSecret: string | undefined = SECRET;

vi.mock('@/shared/env', () => ({
  getEnv: () => ({ LOG_LEVEL: 'silent', CRON_SECRET: cronSecret, AUDIT_RETENTION_DAYS: 180 }),
}));
vi.mock('@/modules/audit', () => ({
  purgeExpiredAuditEvents: (input: { now: Date; retentionDays: number }) =>
    purgeExpiredAuditEvents(input),
}));
vi.mock('@/shared/rate-limit', () => ({
  purgeExpiredRateLimits: (now: Date) => purgeExpiredRateLimits(now),
}));

const { POST } = await import('./route');

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/cleanup', { method: 'POST', headers });
}

beforeEach(() => {
  vi.resetAllMocks();
  cronSecret = SECRET;
  purgeExpiredAuditEvents.mockResolvedValue({
    deleted: 12,
    cutoff: new Date('2026-04-22T00:00:00Z'),
  });
  purgeExpiredRateLimits.mockResolvedValue(3);
});

describe('POST /api/cron/cleanup', () => {
  it('is 404 when CRON_SECRET is not configured', async () => {
    cronSecret = undefined;
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(404);
    expect(purgeExpiredAuditEvents).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect(purgeExpiredAuditEvents).not.toHaveBeenCalled();
    expect(purgeExpiredRateLimits).not.toHaveBeenCalled();
  });

  it('purges audit events by retention and expired rate limits', async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      result: { auditDeleted: 12, auditCutoff: '2026-04-22T00:00:00.000Z', rateLimitDeleted: 3 },
    });
    expect(purgeExpiredAuditEvents).toHaveBeenCalledWith({
      now: expect.any(Date) as Date,
      retentionDays: 180,
    });
  });

  it('maps failures to a 500 without details', async () => {
    purgeExpiredAuditEvents.mockRejectedValue(new Error('db down'));
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db down');
  });
});
