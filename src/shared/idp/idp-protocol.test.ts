import { describe, expect, it } from 'vitest';

import { parseIdpAuditPage } from './idp-audit';
import { idpBasicAuthorization, parseIdpError } from './idp-protocol';

describe('idpBasicAuthorization', () => {
  it('кодирует части как form-urlencoded перед base64', () => {
    const header = idpBasicAuthorization('tasker', 'a+b/c= d');
    const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
    expect(decoded).toBe('tasker:a%2Bb%2Fc%3D+d');
  });
});

describe('parseIdpError', () => {
  it('берёт код и сообщение из тела', () => {
    const error = parseIdpError(
      400,
      { error: { code: 'VALIDATION_ERROR', message: 'Сначала снимите роль администратора' } },
      null,
    );
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Сначала снимите роль администратора');
    expect(error.status).toBe(400);
  });

  it('без тела — код по статусу', () => {
    expect(parseIdpError(404, null, null).code).toBe('NOT_FOUND');
    expect(parseIdpError(502, 'bad gateway', null).code).toBe('INTERNAL_ERROR');
  });

  it('неизвестный код из тела заменяется кодом статуса', () => {
    expect(parseIdpError(403, { error: { code: 'WHAT', message: 'x' } }, null).code).toBe(
      'FORBIDDEN',
    );
  });

  it('читает Retry-After', () => {
    expect(parseIdpError(429, null, '120').retryAfterSeconds).toBe(120);
    expect(parseIdpError(429, null, 'soon').retryAfterSeconds).toBeNull();
  });
});

describe('parseIdpAuditPage', () => {
  const event = {
    id: '01a15e8d-c296-72b8-9550-6d6db0a28b4e',
    kind: 'auth.oidc_authorized',
    category: 'security',
    createdAt: '2026-10-21T13:01:51.126Z',
    actor: { id: 'sub-1', name: 'Анна' },
    targetUserId: null,
    impersonatorId: null,
    data: { clientId: 'tasker' },
    text: 'Вход в Tasker',
    details: null,
    ip: '203.0.113.5',
    device: 'Chrome, Windows',
  };

  it('разбирает события и курсор', () => {
    const page = parseIdpAuditPage({ events: [event], nextCursor: null });
    expect(page.events[0]?.createdAt).toEqual(new Date('2026-10-21T13:01:51.126Z'));
    expect(page.events[0]?.text).toBe('Вход в Tasker');
    expect(page.nextCursor).toBeNull();
  });

  it('отклоняет неожиданный формат', () => {
    expect(() => parseIdpAuditPage({ items: [] })).toThrow();
  });
});
