import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '@/shared/errors';

const queryRaw = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const deleteMany = vi.fn<(...args: unknown[]) => Promise<{ count: number }>>();

vi.mock('@/shared/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    actionRateLimit: { deleteMany: (...args: unknown[]) => deleteMany(...args) },
  },
}));

const { consumeRateLimit, enforceRateLimit, enforceRateLimitChecks } = await import('./rate-limit');

const RULE = { windowSeconds: 60, max: 2 };

beforeEach(() => {
  queryRaw.mockReset();
  deleteMany.mockReset().mockResolvedValue({ count: 0 });
});

describe('consumeRateLimit', () => {
  it('allows attempts up to max', async () => {
    queryRaw.mockResolvedValueOnce([{ count: 2, retryAfter: 30 }]);
    await expect(consumeRateLimit('k', RULE)).resolves.toEqual({
      allowed: true,
      count: 2,
      retryAfterSeconds: 30,
    });
  });

  it('denies attempts over max', async () => {
    queryRaw.mockResolvedValueOnce([{ count: 3, retryAfter: 0 }]);
    await expect(consumeRateLimit('k', RULE)).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });
});

describe('enforceRateLimitChecks', () => {
  const check = (key: string) => ({
    action: 'sign-in' as const,
    scope: 'ip' as const,
    key,
    rule: RULE,
  });

  it('passes when all checks are allowed', async () => {
    queryRaw.mockResolvedValue([{ count: 1, retryAfter: 60 }]);
    await expect(enforceRateLimitChecks([check('a'), check('b')])).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError with the longest wait', async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 5, retryAfter: 40 }])
      .mockResolvedValueOnce([{ count: 9, retryAfter: 300 }]);

    const error = await enforceRateLimitChecks([check('a'), check('b')]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(300);
    expect((error as RateLimitError).message).toBe('Слишком много попыток. Повторите через 5 мин.');
  });

  it('allows the request when the database fails (fail-open)', async () => {
    queryRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(enforceRateLimitChecks([check('a')])).resolves.toBeUndefined();
  });
});

describe('enforceRateLimit', () => {
  it('checks every rule of the action', async () => {
    queryRaw.mockResolvedValue([{ count: 1, retryAfter: 600 }]);
    await enforceRateLimit('sign-in', { ip: '10.0.0.1', email: 'user@example.com' });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
