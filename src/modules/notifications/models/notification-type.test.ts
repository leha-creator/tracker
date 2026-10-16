import { describe, expect, it } from 'vitest';

import { resolveChannels, resolvePreferenceMatrix } from './notification-preferences';
import { isNotificationType, NOTIFICATION_TYPES, supportsChannel } from './notification-type';

describe('notification types', () => {
  it('recognizes known types only', () => {
    expect(isNotificationType('mention')).toBe(true);
    expect(isNotificationType('unknown')).toBe(false);
    expect(isNotificationType(1)).toBe(false);
  });

  it('invitation is in-app only', () => {
    expect(supportsChannel('workspace_invitation', 'inApp')).toBe(true);
    expect(supportsChannel('workspace_invitation', 'email')).toBe(false);
  });
});

describe('resolveChannels', () => {
  it('uses defaults when nothing is saved', () => {
    expect(resolveChannels('mention', null)).toEqual({ inApp: true, email: true });
    expect(resolveChannels('task_comment', undefined)).toEqual({ inApp: true, email: false });
  });

  it('uses the saved preference', () => {
    expect(resolveChannels('mention', { inApp: false, email: true })).toEqual({
      inApp: false,
      email: true,
    });
  });

  it('keeps unsupported channels off', () => {
    expect(resolveChannels('workspace_invitation', { inApp: true, email: true })).toEqual({
      inApp: true,
      email: false,
    });
  });

  it('builds a matrix for all types', () => {
    const matrix = resolvePreferenceMatrix(
      new Map([['task_comment', { inApp: false, email: true }]]),
    );
    expect(Object.keys(matrix)).toEqual([...NOTIFICATION_TYPES]);
    expect(matrix.task_comment).toEqual({ inApp: false, email: true });
    expect(matrix.mention).toEqual({ inApp: true, email: true });
  });
});
