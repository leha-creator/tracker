import { describe, expect, it } from 'vitest';

import {
  assertCanBan,
  assertCanDelete,
  assertCanManageUser,
  assertRoleChange,
  banDurationToSeconds,
  isDeleteConfirmed,
  resolveBanState,
} from './admin-user';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const user = { id: 'user-1', role: 'user' } as const;
const admin = { id: 'admin-1', role: 'admin' } as const;

describe('banDurationToSeconds', () => {
  it('maps durations to seconds, forever to undefined', () => {
    expect(banDurationToSeconds('forever')).toBeUndefined();
    expect(banDurationToSeconds('1d')).toBe(86_400);
    expect(banDurationToSeconds('7d')).toBe(604_800);
    expect(banDurationToSeconds('30d')).toBe(2_592_000);
  });
});

describe('resolveBanState', () => {
  it('is active when not banned', () => {
    expect(resolveBanState({ banned: false, banExpires: null }, NOW)).toEqual({ kind: 'active' });
    expect(resolveBanState({ banned: null, banExpires: null }, NOW)).toEqual({ kind: 'active' });
  });

  it('is banned forever without expiry', () => {
    expect(resolveBanState({ banned: true, banExpires: null }, NOW)).toEqual({
      kind: 'banned',
      until: null,
    });
  });

  it('is banned until future expiry', () => {
    const until = new Date('2026-10-20T00:00:00.000Z');
    expect(resolveBanState({ banned: true, banExpires: until }, NOW)).toEqual({
      kind: 'banned',
      until,
    });
  });

  it('treats expired ban as active', () => {
    const expired = new Date('2026-10-15T00:00:00.000Z');
    expect(resolveBanState({ banned: true, banExpires: expired }, NOW)).toEqual({
      kind: 'active',
    });
  });
});

describe('assertCanManageUser', () => {
  it('forbids acting on yourself', () => {
    expect(() => assertCanManageUser('admin-1', admin)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('allows acting on another user', () => {
    expect(() => assertCanManageUser('admin-1', user)).not.toThrow();
  });
});

describe('assertCanBan', () => {
  it('forbids banning an admin', () => {
    expect(() => assertCanBan(admin)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('allows banning a user', () => {
    expect(() => assertCanBan(user)).not.toThrow();
  });
});

describe('assertCanDelete', () => {
  it('forbids deleting an admin', () => {
    expect(() => assertCanDelete(admin, [])).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('forbids deleting a sole owner and names the workspaces', () => {
    expect(() => assertCanDelete(user, [{ name: 'Альфа' }, { name: 'Бета' }])).toThrow(
      expect.objectContaining({
        code: 'CONFLICT',
        message: expect.stringContaining('«Альфа», «Бета»'),
      }),
    );
  });

  it('allows deleting a user without sole-owned workspaces', () => {
    expect(() => assertCanDelete(user, [])).not.toThrow();
  });
});

describe('assertRoleChange', () => {
  it('rejects the same role', () => {
    expect(() => assertRoleChange(admin, 'admin')).toThrow('Пользователь уже администратор');
    expect(() => assertRoleChange(user, 'user')).toThrow('Пользователь уже не администратор');
  });

  it('allows a different role', () => {
    expect(() => assertRoleChange(user, 'admin')).not.toThrow();
  });
});

describe('isDeleteConfirmed', () => {
  it('compares emails ignoring case and surrounding spaces', () => {
    expect(isDeleteConfirmed('User@Example.com', '  user@example.COM ')).toBe(true);
    expect(isDeleteConfirmed('user@example.com', 'other@example.com')).toBe(false);
  });
});
