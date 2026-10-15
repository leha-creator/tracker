import { describe, expect, it } from 'vitest';

import {
  Invitation,
  invitationUrl,
  parseInvitationStatus,
  type InvitationStatus,
} from './invitation';

const NOW = new Date('2026-10-15T12:00:00Z');
const TOMORROW = new Date('2026-10-16T12:00:00Z');
const YESTERDAY = new Date('2026-10-14T12:00:00Z');

function invitationOf(status: InvitationStatus = 'pending', expiresAt = TOMORROW) {
  return new Invitation('inv-1', 'ws-1', 'Bob@Example.com', 'member', status, expiresAt);
}

describe('Invitation.stateFor', () => {
  it('is actionable for the recipient regardless of email case', () => {
    expect(invitationOf().stateFor(' bob@example.COM ', NOW)).toBe('actionable');
  });

  it('detects wrong recipient', () => {
    expect(invitationOf().stateFor('eve@example.com', NOW)).toBe('wrong-recipient');
  });

  it('detects expiry', () => {
    expect(invitationOf('pending', YESTERDAY).stateFor('bob@example.com', NOW)).toBe('expired');
    expect(invitationOf('pending', NOW).stateFor('bob@example.com', NOW)).toBe('expired');
  });

  it.each(['accepted', 'rejected', 'canceled'] as const)('treats %s as processed', (status) => {
    expect(invitationOf(status).stateFor('eve@example.com', NOW)).toBe('processed');
  });
});

describe('Invitation.assertAcceptableBy', () => {
  it('passes for the recipient', () => {
    expect(() => invitationOf().assertAcceptableBy('bob@example.com', NOW)).not.toThrow();
  });

  it('throws FORBIDDEN for another user', () => {
    expect(() => invitationOf().assertAcceptableBy('eve@example.com', NOW)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('throws VALIDATION_ERROR for expired or processed invitation', () => {
    expect(() =>
      invitationOf('pending', YESTERDAY).assertAcceptableBy('bob@example.com', NOW),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => invitationOf('accepted').assertAcceptableBy('bob@example.com', NOW)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});

describe('helpers', () => {
  it('builds invitation url', () => {
    expect(invitationUrl('http://localhost:3000', 'abc123')).toBe(
      'http://localhost:3000/invite/abc123',
    );
  });

  it('maps unknown status to canceled', () => {
    expect(parseInvitationStatus('pending')).toBe('pending');
    expect(parseInvitationStatus('weird')).toBe('canceled');
  });
});
