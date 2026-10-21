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
  OIDC_ISSUER: 'https://auth.plwedding.ru/',
  OIDC_CLIENT_SECRET: 'local-tasker-secret-0123456789abcdef',
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

  it('defaults and validates DOCUMENTS_WORKSPACE_QUOTA_MB', () => {
    expect(parseEnv(VALID_ENV).DOCUMENTS_WORKSPACE_QUOTA_MB).toBe(1024);
    expect(
      parseEnv({ ...VALID_ENV, DOCUMENTS_WORKSPACE_QUOTA_MB: '256' }).DOCUMENTS_WORKSPACE_QUOTA_MB,
    ).toBe(256);
    expect(() => parseEnv({ ...VALID_ENV, DOCUMENTS_WORKSPACE_QUOTA_MB: '0' })).toThrow(
      EnvValidationError,
    );
  });

  it('defaults and bounds AUDIT_RETENTION_DAYS', () => {
    expect(parseEnv(VALID_ENV).AUDIT_RETENTION_DAYS).toBe(180);
    expect(parseEnv({ ...VALID_ENV, AUDIT_RETENTION_DAYS: '365' }).AUDIT_RETENTION_DAYS).toBe(365);
    for (const value of ['29', '3651', '1.5']) {
      expect(() => parseEnv({ ...VALID_ENV, AUDIT_RETENTION_DAYS: value })).toThrow(
        EnvValidationError,
      );
    }
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

  describe('GitHub App', () => {
    const GITHUB_ENV = {
      GITHUB_APP_ID: '123456',
      GITHUB_APP_SLUG: 'tasker-dev',
      GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
      GITHUB_APP_CLIENT_ID: 'Iv23li-client',
      GITHUB_APP_CLIENT_SECRET: 'client-secret-value',
      GITHUB_WEBHOOK_SECRET: 'webhook-secret-value',
    };

    it('is disabled when nothing is set (including empty strings)', () => {
      expect(parseEnv(VALID_ENV).GITHUB_ENABLED).toBe(false);
      expect(
        parseEnv({ ...VALID_ENV, GITHUB_APP_ID: '', GITHUB_WEBHOOK_SECRET: '' }).GITHUB_ENABLED,
      ).toBe(false);
    });

    it('is enabled when everything is set and unescapes PEM newlines', () => {
      const env = parseEnv({ ...VALID_ENV, ...GITHUB_ENV });
      expect(env.GITHUB_ENABLED).toBe(true);
      expect(env.GITHUB_APP_PRIVATE_KEY).toBe(
        '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
      );
    });

    it('rejects partial configuration listing missing keys only', () => {
      const caught = (() => {
        try {
          parseEnv({ ...VALID_ENV, GITHUB_APP_ID: '1', GITHUB_APP_SLUG: 'tasker' });
        } catch (error) {
          return error;
        }
      })();
      expect(caught).toBeInstanceOf(EnvValidationError);
      expect((caught as EnvValidationError).invalidKeys).toEqual([
        'GITHUB_APP_PRIVATE_KEY',
        'GITHUB_APP_CLIENT_ID',
        'GITHUB_APP_CLIENT_SECRET',
        'GITHUB_WEBHOOK_SECRET',
      ]);
    });

    it('validates app id and webhook secret without leaking values', () => {
      const caught = (() => {
        try {
          parseEnv({
            ...VALID_ENV,
            ...GITHUB_ENV,
            GITHUB_APP_ID: 'abc',
            GITHUB_WEBHOOK_SECRET: 'short',
          });
        } catch (error) {
          return error;
        }
      })();
      expect((caught as EnvValidationError).invalidKeys).toEqual([
        'GITHUB_APP_ID',
        'GITHUB_WEBHOOK_SECRET',
      ]);
      expect((caught as EnvValidationError).message).not.toContain('short');
    });
  });

  describe('OIDC', () => {
    it('normalizes issuer to origin and defaults client id', () => {
      const env = parseEnv(VALID_ENV);
      expect(env.OIDC_ISSUER).toBe('https://auth.plwedding.ru');
      expect(env.OIDC_CLIENT_ID).toBe('tasker');
    });

    it('requires issuer and secret', () => {
      const { OIDC_ISSUER: _issuer, ...withoutIssuer } = VALID_ENV;
      expect(() => parseEnv(withoutIssuer)).toThrow(/OIDC_ISSUER/);
      const { OIDC_CLIENT_SECRET: _secret, ...withoutSecret } = VALID_ENV;
      expect(() => parseEnv(withoutSecret)).toThrow(/OIDC_CLIENT_SECRET/);
    });

    it('rejects issuer with path and short secret without leaking it', () => {
      expect(() =>
        parseEnv({ ...VALID_ENV, OIDC_ISSUER: 'https://auth.plwedding.ru/oidc' }),
      ).toThrow(/OIDC_ISSUER/);
      const short = { ...VALID_ENV, OIDC_CLIENT_SECRET: 'short-oidc-secret' };
      expect(() => parseEnv(short)).toThrow(/OIDC_CLIENT_SECRET/);
      expect(() => parseEnv(short)).not.toThrow(/short-oidc/);
    });
  });

  describe('reminders', () => {
    it('CRON_SECRET is optional, empty string means unset', () => {
      expect(parseEnv(VALID_ENV).CRON_SECRET).toBeUndefined();
      expect(parseEnv({ ...VALID_ENV, CRON_SECRET: '' }).CRON_SECRET).toBeUndefined();
      const secret = 'x'.repeat(32);
      expect(parseEnv({ ...VALID_ENV, CRON_SECRET: secret }).CRON_SECRET).toBe(secret);
    });

    it('rejects short CRON_SECRET without leaking it', () => {
      expect(() => parseEnv({ ...VALID_ENV, CRON_SECRET: 'too-short-secret' })).toThrow(
        /CRON_SECRET/,
      );
      expect(() => parseEnv({ ...VALID_ENV, CRON_SECRET: 'too-short-secret' })).not.toThrow(
        /too-short/,
      );
    });

    it('REMINDERS_TIMEZONE defaults to Moscow and must be a known zone', () => {
      expect(parseEnv(VALID_ENV).REMINDERS_TIMEZONE).toBe('Europe/Moscow');
      expect(parseEnv({ ...VALID_ENV, REMINDERS_TIMEZONE: 'Asia/Tokyo' }).REMINDERS_TIMEZONE).toBe(
        'Asia/Tokyo',
      );
      expect(() => parseEnv({ ...VALID_ENV, REMINDERS_TIMEZONE: 'Mars/Base' })).toThrow(
        /REMINDERS_TIMEZONE/,
      );
    });
  });
});
