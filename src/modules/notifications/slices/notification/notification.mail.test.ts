import { describe, expect, it } from 'vitest';

import { buildNotificationMail } from './notification.mail';

const input = {
  text: { title: 'Упоминание в комментарии', subject: '#7 <b>Задача</b>', excerpt: 'a & b' },
  actorName: 'Анна',
  workspaceName: 'Команда',
  url: 'https://tasker.test/w/team/tasks/7#comment-c1',
  settingsUrl: 'https://tasker.test/profile/notifications',
};

describe('buildNotificationMail', () => {
  it('builds subject and plain text', () => {
    const mail = buildNotificationMail(input);
    expect(mail.subject).toBe('Упоминание в комментарии: #7 <b>Задача</b> — Tasker');
    expect(mail.text).toContain('Анна · #7 <b>Задача</b>');
    expect(mail.text).toContain('Открыть: https://tasker.test/w/team/tasks/7#comment-c1');
  });

  it('escapes user data in HTML', () => {
    const mail = buildNotificationMail(input);
    expect(mail.html).toContain('#7 &lt;b&gt;Задача&lt;/b&gt;');
    expect(mail.html).toContain('a &amp; b');
    expect(mail.html).not.toContain('<b>Задача</b>');
  });

  it('omits the excerpt block when there is none', () => {
    const mail = buildNotificationMail({ ...input, text: { ...input.text, excerpt: null } });
    expect(mail.html).not.toContain('blockquote');
  });
});
