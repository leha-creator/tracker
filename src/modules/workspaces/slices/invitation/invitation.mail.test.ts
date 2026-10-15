import { describe, expect, it } from 'vitest';

import { buildInvitationMail } from './invitation.mail';

const input = {
  workspaceName: '<b>Team</b> & Co',
  inviterName: 'Eve "<script>"',
  role: 'member' as const,
  inviteUrl: 'http://localhost:3000/invite/abc123',
  expiresAt: new Date('2026-10-22T12:00:00Z'),
};

describe('buildInvitationMail', () => {
  it('escapes user data in html', () => {
    const { html } = buildInvitationMail(input);
    expect(html).toContain('&lt;b&gt;Team&lt;/b&gt; &amp; Co');
    expect(html).toContain('Eve &quot;&lt;script&gt;&quot;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Team</b>');
  });

  it('contains invite link, role and expiry in text version', () => {
    const { text, subject } = buildInvitationMail(input);
    expect(text).toContain('http://localhost:3000/invite/abc123');
    expect(text).toContain('Роль: участник');
    expect(text).toContain('22 октября 2026');
    expect(subject).toContain('<b>Team</b> & Co');
  });
});
