import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ConflictError,
  formatRetryAfter,
  INTERNAL_ERROR_MESSAGE,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  toErrorResponse,
} from '@/shared/errors';

async function readBody(response: Response): Promise<unknown> {
  return response.json();
}

describe('toErrorResponse', () => {
  it.each([
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new NotFoundError('Проект не найден'), 404, 'NOT_FOUND'],
    [new ConflictError(), 409, 'CONFLICT'],
  ])('maps %s to HTTP %i', async (error, status, code) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(status);
    expect(await readBody(response)).toEqual({ error: { code, message: error.message } });
  });

  it('returns 400 with field errors for ZodError', async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const response = toErrorResponse(parsed.error);

    expect(response.status).toBe(400);
    expect(await readBody(response)).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fieldErrors: { name: expect.any(Array) as unknown } },
    });
  });

  it('returns 500 without internal details for unexpected errors', async () => {
    const response = toErrorResponse(new TypeError('Cannot read properties of undefined'));

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await readBody(response)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE },
    });
  });
});

describe('toErrorResponse with RateLimitError', () => {
  it('returns 429 with Retry-After', async () => {
    const response = toErrorResponse(new RateLimitError(90));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('90');
    expect(await readBody(response)).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Слишком много попыток. Повторите через 2 мин.' },
    });
  });

  it('formats short waits in seconds', () => {
    expect(formatRetryAfter(0.2)).toBe('1 с');
    expect(formatRetryAfter(59)).toBe('59 с');
    expect(formatRetryAfter(61)).toBe('2 мин');
  });
});
