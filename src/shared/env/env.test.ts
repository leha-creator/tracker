import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '@/shared/env';

const VALID_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://tasker:tasker@localhost:5433/tasker',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'tasker',
  S3_SECRET_ACCESS_KEY: 'super-secret-value',
  S3_BUCKET: 'tasker-attachments',
};

describe('parseEnv', () => {
  it('parses valid env and applies defaults', () => {
    const env = parseEnv(VALID_ENV);

    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.S3_REGION).toBe('us-east-1');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
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
});
