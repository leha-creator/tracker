import { describe, expect, it } from 'vitest';

import {
  API_TOKEN_TOUCH_INTERVAL_MS,
  apiTokenState,
  buildClaudeMcpCommand,
  buildMcpJson,
  expiryToDate,
  generateApiToken,
  hasScope,
  hashApiToken,
  isApiTokenFormat,
  mcpEndpointUrl,
  normalizeScopes,
  parseBearer,
  shouldTouchApiToken,
} from '.';

const NOW = new Date('2026-10-16T12:00:00Z');

describe('generateApiToken', () => {
  it('создаёт токен формата tkr_ + 43 символа base64url, префикс и SHA-256', () => {
    const { token, prefix, hash } = generateApiToken();
    expect(isApiTokenFormat(token)).toBe(true);
    expect(prefix).toBe(token.slice(0, 12));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiToken(token));
  });

  it('каждый раз новый токен', () => {
    expect(generateApiToken().token).not.toBe(generateApiToken().token);
  });
});

describe('parseBearer', () => {
  const { token } = generateApiToken();

  it('достаёт токен из заголовка без учёта регистра схемы и лишних пробелов', () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
    expect(parseBearer(`bearer ${token}`)).toBe(token);
    expect(parseBearer(`  BEARER   ${token}  `)).toBe(token);
  });

  it('отклоняет пустой заголовок, другую схему и мусор', () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer('')).toBeNull();
    expect(parseBearer(`Basic ${token}`)).toBeNull();
    expect(parseBearer(token)).toBeNull();
    expect(parseBearer('Bearer tkr_short')).toBeNull();
    expect(parseBearer(`Bearer ${token}x`)).toBeNull();
    expect(parseBearer(`Bearer ${token} extra`)).toBeNull();
    expect(parseBearer(`Bearer ${token.replace('tkr_', 'abc_')}`)).toBeNull();
  });
});

describe('expiryToDate', () => {
  it('считает срок от текущего момента, бессрочный — null', () => {
    expect(expiryToDate('30d', NOW)).toEqual(new Date('2026-11-15T12:00:00Z'));
    expect(expiryToDate('365d', NOW)).toEqual(new Date('2027-10-16T12:00:00Z'));
    expect(expiryToDate('never', NOW)).toBeNull();
  });
});

describe('apiTokenState', () => {
  it('отозванный важнее истёкшего', () => {
    expect(apiTokenState({ revokedAt: NOW, expiresAt: new Date(0) }, NOW)).toBe('revoked');
  });

  it('истекает ровно в момент expiresAt', () => {
    expect(apiTokenState({ revokedAt: null, expiresAt: NOW }, NOW)).toBe('expired');
    expect(apiTokenState({ revokedAt: null, expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(
      'active',
    );
    expect(apiTokenState({ revokedAt: null, expiresAt: null }, NOW)).toBe('active');
  });
});

describe('shouldTouchApiToken', () => {
  it('обновляет lastUsedAt не чаще раза в минуту', () => {
    expect(shouldTouchApiToken(null, NOW)).toBe(true);
    expect(shouldTouchApiToken(new Date(NOW.getTime() - 1000), NOW)).toBe(false);
    expect(shouldTouchApiToken(new Date(NOW.getTime() - API_TOKEN_TOUCH_INTERVAL_MS), NOW)).toBe(
      true,
    );
  });
});

describe('фрагменты подключения', () => {
  it('адрес эндпоинта без двойного слеша', () => {
    expect(mcpEndpointUrl('https://tracker.example.com/')).toBe(
      'https://tracker.example.com/api/mcp',
    );
  });

  it('команда claude mcp add с токеном в заголовке', () => {
    expect(buildClaudeMcpCommand('http://localhost:3000', 'tkr_x')).toBe(
      'claude mcp add --transport http --scope local tasker http://localhost:3000/api/mcp --header "Authorization: Bearer tkr_x"',
    );
  });

  it('.mcp.json берёт токен из переменной окружения', () => {
    const config = JSON.parse(buildMcpJson('http://localhost:3000')) as {
      mcpServers: { tasker: { type: string; url: string; headers: Record<string, string> } };
    };
    expect(config.mcpServers.tasker).toEqual({
      type: 'http',
      url: 'http://localhost:3000/api/mcp',
      headers: { Authorization: 'Bearer ${TASKER_TOKEN}' },
    });
  });
});

describe('normalizeScopes', () => {
  it('всегда добавляет read, убирает повторы и неизвестные значения', () => {
    expect(normalizeScopes([])).toEqual(['read']);
    expect(normalizeScopes(['documents', 'tasks', 'tasks', 'admin'])).toEqual([
      'read',
      'tasks',
      'documents',
    ]);
  });

  it('hasScope: read есть всегда', () => {
    expect(hasScope([], 'read')).toBe(true);
    expect(hasScope(['read'], 'tasks')).toBe(false);
    expect(hasScope(['read', 'tasks'], 'tasks')).toBe(true);
  });
});
