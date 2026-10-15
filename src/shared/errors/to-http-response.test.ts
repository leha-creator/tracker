import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ConflictError,
  INTERNAL_ERROR_MESSAGE,
  NotFoundError,
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
