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

  it('uses task key when present', () => {
    expect(
      formatNotificationText({
        type: 'task_assigned',
        payload: { ...task, taskKey: 'TSK-42' },
        commentId: null,
        invitationId: null,
      }).subject,
    ).toBe('TSK-42 Починить вход');
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

describe('GitHub notifications', () => {
  const pr = {
    ...task,
    taskKey: 'TSK-42',
    repositoryFullName: 'acme/web',
    pullRequestNumber: 12,
    pullRequestTitle: 'Fix login',
    pullRequestUrl: 'https://github.com/acme/web/pull/12',
  };
  const base = { commentId: null, invitationId: null };

  it('validates PR payloads', () => {
    expect(parseNotificationPayload('pr_merged', pr)).toEqual(pr);
    expect(parseNotificationPayload('pr_linked', task)).toBeNull();
    expect(parseNotificationPayload('pr_review', { ...pr, reviewState: 'commented' })).toBeNull();
  });

  it('links to the task', () => {
    expect(buildNotificationHref({ ...base, type: 'pr_linked', payload: pr })).toBe(
      '/w/team/tasks/42',
    );
  });

  it.each([
    ['pr_linked', pr, 'PR acme/web#12 привязан к задаче'],
    ['pr_merged', pr, 'PR acme/web#12 слит'],
    ['pr_review', { ...pr, reviewState: 'approved' }, 'PR acme/web#12 одобрен'],
    [
      'pr_review',
      { ...pr, reviewState: 'changes_requested' },
      'В PR acme/web#12 запросили изменения',
    ],
  ] as const)('%s → title', (type, payload, title) => {
    const text = formatNotificationText({ ...base, type, payload } as Parameters<
      typeof formatNotificationText
    >[0]);
    expect(text).toEqual({ title, subject: 'TSK-42 Починить вход', excerpt: 'Fix login' });
  });
});

describe('task_status_changed', () => {
  const payload = {
    ...task,
    taskKey: 'TSK-42',
    projectName: 'Сайт',
    fromStatus: 'К выполнению',
    toStatus: 'В работе',
  };
  const notification = {
    type: 'task_status_changed' as const,
    payload,
    commentId: null,
    invitationId: null,
  };

  it('validates the payload: statuses are required', () => {
    expect(parseNotificationPayload('task_status_changed', payload)).toEqual(payload);
    expect(parseNotificationPayload('task_status_changed', task)).toBeNull();
  });

  it('links to the task and names both statuses and the project', () => {
    expect(buildNotificationHref(notification)).toBe('/w/team/tasks/42');
    expect(formatNotificationText(notification)).toEqual({
      title: 'Статус: К выполнению → В работе',
      subject: `TSK-42 ${task.taskTitle}`,
      excerpt: 'Проект «Сайт»',
    });
  });
});

describe('task_due_soon / task_overdue', () => {
  const payload = { ...task, taskKey: 'TSK-42', dueDate: '2026-10-18' };

  it('validates the payload: dueDate is an ISO date', () => {
    expect(parseNotificationPayload('task_due_soon', payload)).toEqual(payload);
    expect(parseNotificationPayload('task_overdue', task)).toBeNull();
    expect(
      parseNotificationPayload('task_overdue', { ...payload, dueDate: '18.10.2026' }),
    ).toBeNull();
  });

  it('links to the task and shows the due date without a day shift', () => {
    const dueSoon = {
      type: 'task_due_soon' as const,
      payload,
      commentId: null,
      invitationId: null,
    };
    const overdue = { ...dueSoon, type: 'task_overdue' as const };

    expect(buildNotificationHref(dueSoon)).toBe('/w/team/tasks/42');
    expect(formatNotificationText(dueSoon)).toEqual({
      title: 'Завтра срок задачи',
      subject: `TSK-42 ${task.taskTitle}`,
      excerpt: 'Срок: 18 октября 2026 г.',
    });
    expect(formatNotificationText(overdue)).toEqual({
      title: 'Срок задачи прошёл',
      subject: `TSK-42 ${task.taskTitle}`,
      excerpt: 'Срок был 18 октября 2026 г.',
    });
  });
});

describe('forAgent', () => {
  it('adds the agent to the title', () => {
    const text = formatNotificationText({
      type: 'task_assigned',
      payload: {
        workspaceSlug: 'team',
        workspaceName: 'Команда',
        actorName: 'Анна',
        taskNumber: 1,
        taskTitle: 'A',
        forAgent: { name: 'Claude' },
      },
      commentId: null,
      invitationId: null,
    });
    expect(text.title).toBe('Вас назначили ответственным (для агента Claude)');
  });
});

describe('meeting_summary_ready', () => {
  const payload = {
    ...task,
    taskKey: 'TSK-42',
    documentId: 'doc-1',
    documentTitle: 'Встреча 21 октября — TSK-42',
  };

  it('links to the note and names the task', () => {
    const notification = {
      type: 'meeting_summary_ready' as const,
      payload,
      commentId: null,
      invitationId: null,
    };
    expect(parseNotificationPayload('meeting_summary_ready', payload)).toEqual(payload);
    expect(parseNotificationPayload('meeting_summary_ready', task)).toBeNull();
    expect(buildNotificationHref(notification)).toBe('/w/team/docs/doc-1');
    expect(formatNotificationText(notification)).toEqual({
      title: 'Конспект встречи сохранён',
      subject: `TSK-42 ${task.taskTitle}`,
      excerpt: 'Встреча 21 октября — TSK-42',
    });
  });
});
