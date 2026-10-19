import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_KINDS, AUDIT_EVENTS, type AuditEventKind } from '@/shared/audit/client';

import { describeAuditEvent, type AuditDescribeContext } from './describe-audit-event';

const MEMBER: AuditDescribeContext = {
  workspaceSlug: 'team',
  targetUserId: null,
  perspective: 'member',
};
const ADMIN: AuditDescribeContext = {
  workspaceSlug: null,
  targetUserId: 'u2',
  perspective: 'admin',
};

/** Минимальный корректный снимок для каждого типа — по схеме каталога. */
const SAMPLE: { [K in AuditEventKind]?: unknown } = {};
const STRING = 'Значение';
for (const kind of AUDIT_EVENT_KINDS) {
  const shape = (AUDIT_EVENTS[kind].data as unknown as { shape: Record<string, unknown> }).shape;
  const sample: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(shape)) {
    const def = (schema as { def: { type: string; options?: unknown[]; entries?: object } }).def;
    if (def.type === 'enum') sample[key] = Object.values(def.entries ?? {})[0];
    else if (def.type === 'boolean') sample[key] = true;
    else if (def.type === 'number') sample[key] = 7;
    else if (def.type === 'nullable') sample[key] = null;
    else if (def.type === 'record') sample[key] = { signupMode: 'closed' };
    else sample[key] = key === 'documentId' || key === 'projectId' ? 'id-1' : STRING;
  }
  SAMPLE[kind] = sample;
}

describe('describeAuditEvent', () => {
  it.each(AUDIT_EVENT_KINDS)('describes %s', (kind) => {
    const result = describeAuditEvent(kind, SAMPLE[kind], MEMBER);
    expect(result.text).not.toBe('Событие без подробностей');
    expect(result.text.length).toBeGreaterThan(3);
  });

  it('links a task inside its workspace', () => {
    const data = { taskKey: 'TSK-7', taskNumber: 7, title: 'Починить вход' };
    expect(describeAuditEvent('task.created', data, MEMBER)).toEqual({
      text: 'Создание задачи TSK-7 «Починить вход»',
      details: null,
      href: '/w/team/tasks/7',
    });
  });

  it('gives no link to a deleted task or a deleted workspace', () => {
    const data = { taskKey: 'TSK-7', taskNumber: 7, title: 'A' };
    expect(describeAuditEvent('task.deleted', data, MEMBER).href).toBeNull();
    expect(
      describeAuditEvent('task.created', data, { ...MEMBER, workspaceSlug: null }).href,
    ).toBeNull();
  });

  it('shows ban details and the user link only to admins', () => {
    const data = { userName: 'Борис', duration: '7d', reason: 'спам' };
    expect(describeAuditEvent('admin.user_banned', data, ADMIN)).toEqual({
      text: 'Блокировка пользователя Борис на 7 дней',
      details: 'Причина: спам',
      href: '/admin/users/u2',
    });
    const asMember = describeAuditEvent('admin.user_banned', data, {
      ...ADMIN,
      perspective: 'self',
    });
    expect(asMember.details).toBeNull();
    expect(asMember.href).toBeNull();
  });

  it('explains a failed sign-in by its code', () => {
    expect(
      describeAuditEvent(
        'auth.sign_in_failed',
        { method: 'password', reason: 'INVALID_EMAIL_OR_PASSWORD' },
        MEMBER,
      ).text,
    ).toBe('Неудачный вход по паролю — неверный пароль');
  });

  it('falls back for unknown kinds and broken snapshots', () => {
    expect(describeAuditEvent('nope', {}, MEMBER).text).toBe('Неизвестное событие');
    expect(describeAuditEvent('task.created', { title: 1 }, MEMBER)).toEqual({
      text: 'Событие без подробностей',
      details: null,
      href: null,
    });
  });
});
