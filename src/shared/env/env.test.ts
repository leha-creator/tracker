import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '@/shared/env';

const VALID_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://tasker:tasker@localhost:5433/tasker',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'tasker',
  S3_SECRET_ACCESS_KEY: 'super-secret-value',
  S3_BUCKET: 'tasker-attachments',
  BETTER_AUTH_SECRET: 'a-very-long-local-development-secret-value',
  BETTER_AUTH_URL: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('parses valid env and applies defaults', () => {
    const env = parseEnv(VALID_ENV);

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.S3_REGION).toBe('us-east-1');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('defaults S3_PUBLIC_ENDPOINT to S3_ENDPOINT', () => {
    expect(parseEnv(VALID_ENV).S3_PUBLIC_ENDPOINT).toBe('http://localhost:9000');
    expect(
      parseEnv({ ...VALID_ENV, S3_PUBLIC_ENDPOINT: 'http://localhost:9002' }).S3_PUBLIC_ENDPOINT,
    ).toBe('http://localhost:9002');
  });

  it('defaults LOG_LEVEL to info in production', () => {
    expect(parseEnv({ ...VALID_ENV, NODE_ENV: 'production' }).LOG_LEVEL).toBe('info');
  });

  it('respects explicit LOG_LEVEL and boolean flags', () => {
    const env = parseEnv({ ...VALID_ENV, LOG_LEVEL: 'warn', S3_FORCE_PATH_STYLE: 'false' });

    expect(env.LOG_LEVEL).toBe('warn');
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('lists invalid keys without leaking values', () => {
    const source = {
      ...VALID_ENV,
      DATABASE_URL: 'mysql://user:leaked-password@host/db',
      LOG_LEVEL: 'verbose',
      S3_BUCKET: undefined,
    };

    let caught: unknown;
    try {
      parseEnv(source);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.invalidKeys.sort()).toEqual(['DATABASE_URL', 'LOG_LEVEL', 'S3_BUCKET']);
    expect(error.message).not.toContain('leaked-password');
    expect(error.message).not.toContain('super-secret-value');
  });

  it('rejects short BETTER_AUTH_SECRET without leaking its value', () => {
    expect(() => parseEnv({ ...VALID_ENV, BETTER_AUTH_SECRET: 'short-secret' })).toThrow(
      EnvValidationError,
    );
    try {
      parseEnv({ ...VALID_ENV, BETTER_AUTH_SECRET: 'short-secret' });
    } catch (e) {
      const error = e as EnvValidationError;
      expect(error.invalidKeys).toEqual(['BETTER_AUTH_SECRET']);
      expect(error.message).not.toContain('short-secret');
    }
  });

  it('parses ADMIN_EMAILS into a normalized list', () => {
    const env = parseEnv({ ...VALID_ENV, ADMIN_EMAILS: ' A@x.io, b@y.io ,' });
    expect(env.ADMIN_EMAILS).toEqual(['a@x.io', 'b@y.io']);
  });

  it('defaults ADMIN_EMAILS to an empty list', () => {
    expect(parseEnv(VALID_ENV).ADMIN_EMAILS).toEqual([]);
  });

  it('applies SMTP defaults for local Mailpit', () => {
    const env = parseEnv(VALID_ENV);

    expect(env.SMTP_HOST).toBe('127.0.0.1');
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.MAIL_FROM).toBe('Tasker <no-reply@tasker.local>');
  });

  it('treats empty SMTP_USER and SMTP_PASSWORD as unset', () => {
    const env = parseEnv({ ...VALID_ENV, SMTP_USER: '', SMTP_PASSWORD: '' });

    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it('parses SMTP_PORT and SMTP_SECURE from strings', () => {
    const env = parseEnv({ ...VALID_ENV, SMTP_PORT: '465', SMTP_SECURE: 'true' });

    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('rejects non-numeric SMTP_PORT without leaking its value', () => {
    let caught: unknown;
    try {
      parseEnv({ ...VALID_ENV, SMTP_PORT: 'not-a-port' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as EnvValidationError).invalidKeys).toEqual(['SMTP_PORT']);
    expect((caught as EnvValidationError).message).not.toContain('not-a-port');
  });
});
