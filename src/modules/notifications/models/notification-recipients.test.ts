import { describe, expect, it } from 'vitest';

import { dedupeRecipients, type NotificationEvent } from './notification-recipients';

const payload = {
  workspaceSlug: 'team',
  workspaceName: 'Команда',
  actorName: 'Анна',
  taskNumber: 1,
  taskTitle: 'Задача',
  commentExcerpt: 'Текст',
};

function event(
  type: 'mention' | 'task_comment',
  recipientId: string,
  actorId: string | null = 'actor',
): NotificationEvent {
  return { type, recipientId, workspaceId: 'w1', actorId, payload };
}

describe('dedupeRecipients', () => {
  it('excludes the actor', () => {
    expect(dedupeRecipients([event('mention', 'actor')])).toEqual([]);
  });

  it('keeps one notification per recipient, mention first', () => {
    const result = dedupeRecipients([
      event('task_comment', 'u1'),
      event('mention', 'u1'),
      event('task_comment', 'u2'),
    ]);
    expect(result.map((item) => [item.recipientId, item.type])).toEqual([
      ['u1', 'mention'],
      ['u2', 'task_comment'],
    ]);
  });

  it('keeps events without an actor', () => {
    expect(dedupeRecipients([event('mention', 'u1', null)])).toHaveLength(1);
  });
});
