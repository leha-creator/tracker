import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  INTERNAL_ERROR_MESSAGE,
  InternalError,
  NotFoundError,
  ValidationError,
  ok,
  toActionError,
} from '@/shared/errors';

describe('toActionError', () => {
  it('converts ZodError to VALIDATION_ERROR with field errors', () => {
    const schema = z.object({ title: z.string().min(1), dueDate: z.iso.date() });
    const parsed = schema.safeParse({ title: '', dueDate: 'tomorrow' });
    expect(parsed.success).toBe(false);

    const result = toActionError(parsed.error);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(result.error.fieldErrors ?? {}).sort()).toEqual(['dueDate', 'title']);
    expect(result.error.fieldErrors?.title?.length).toBeGreaterThan(0);
  });

  it('keeps code and message of exposable domain errors', () => {
    expect(toActionError(new NotFoundError('Задача не найдена'))).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Задача не найдена' },
    });
    expect(toActionError(new ForbiddenError()).error.code).toBe('FORBIDDEN');
  });

  it('passes field errors of ValidationError', () => {
    const result = toActionError(
      new ValidationError('Проверьте поля', { fieldErrors: { email: ['Некорректный email'] } }),
    );
    expect(result.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте поля',
      fieldErrors: { email: ['Некорректный email'] },
    });
  });

  it('passes field errors of other domain errors', () => {
    const result = toActionError(
      new ConflictError('Адрес занят', { fieldErrors: { slug: ['Этот адрес уже занят'] } }),
    );
    expect(result.error).toEqual({
      code: 'CONFLICT',
      message: 'Адрес занят',
      fieldErrors: { slug: ['Этот адрес уже занят'] },
    });
  });

  it('hides message and stack of unexpected errors', () => {
    const error = new Error('connection refused to 10.0.0.5 with password=secret');
    const result = toActionError(error);

    expect(result.error).toEqual({ code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE });
    expect(JSON.stringify(result)).not.toContain('10.0.0.5');
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('does not expose message of InternalError', () => {
    const result = toActionError(new InternalError('S3 bucket misconfigured'));
    expect(result.error).toEqual({ code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE });
  });

  it('handles non-Error throwables', () => {
    expect(toActionError('boom').error.code).toBe('INTERNAL_ERROR');
    expect(toActionError(undefined).error.code).toBe('INTERNAL_ERROR');
  });
});

describe('ok', () => {
  it('wraps data into success result', () => {
    expect(ok({ id: '1' })).toEqual({ ok: true, data: { id: '1' } });
  });
});
