import { describe, expect, it } from 'vitest';

import {
  buildNotificationHref,
  excerpt,
  formatNotificationText,
  parseNotificationPayload,
} from './notification-payload';

const task = {
  workspaceSlug: 'team',
  workspaceName: 'Команда',
  actorName: 'Анна',
  taskNumber: 42,
  taskTitle: 'Починить вход',
};

describe('parseNotificationPayload', () => {
  it('accepts a complete payload', () => {
    expect(parseNotificationPayload('task_assigned', task)).toEqual(task);
  });

  it('rejects an incomplete payload', () => {
    expect(parseNotificationPayload('mention', task)).toBeNull();
    expect(parseNotificationPayload('task_assigned', { workspaceSlug: 'team' })).toBeNull();
  });
});

describe('buildNotificationHref', () => {
  it('links a comment with an anchor', () => {
    expect(
      buildNotificationHref({
        type: 'mention',
        payload: { ...task, commentExcerpt: 'Привет' },
        commentId: 'c1',
        invitationId: null,
      }),
    ).toBe('/w/team/tasks/42#comment-c1');
  });

  it('links a task', () => {
    expect(
      buildNotificationHref({
        type: 'task_assigned',
        payload: task,
        commentId: null,
        invitationId: null,
      }),
    ).toBe('/w/team/tasks/42');
  });

  it('links an invitation', () => {
    expect(
      buildNotificationHref({
        type: 'workspace_invitation',
        payload: { workspaceSlug: 'team', workspaceName: 'Команда', actorName: null },
        commentId: null,
        invitationId: 'inv1',
      }),
    ).toBe('/invite/inv1');
  });
});

describe('formatNotificationText', () => {
  it('describes a mention', () => {
    expect(
      formatNotificationText({
        type: 'mention',
        payload: { ...task, commentExcerpt: 'Посмотри' },
        commentId: 'c1',
        invitationId: null,
      }),
    ).toEqual({
      title: 'Упоминание в комментарии',
      subject: '#42 Починить вход',
      excerpt: 'Посмотри',
    });
  });
});

describe('excerpt', () => {
  it('collapses whitespace', () => {
    expect(excerpt('  строка\n\nвторая  ')).toBe('строка вторая');
  });

  it('truncates long text', () => {
    const result = excerpt('a'.repeat(200), 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('…')).toBe(true);
  });
});
