import { describe, expect, it } from 'vitest';

import { parseReturnPath, RETURN_TO_MAX_LENGTH, withTaskPanel } from './task-redirect';

describe('parseReturnPath', () => {
  it.each(['/w/acme/projects/p1/board', '/w/acme/tasks?priority=high&sort=due', '/w/acme'])(
    'accepts %j',
    (value) => {
      expect(parseReturnPath(value, 'acme')).toBe(value);
    },
  );

  it('drops the hash', () => {
    expect(parseReturnPath('/w/acme/tasks#top', 'acme')).toBe('/w/acme/tasks');
  });

  it.each([
    undefined,
    null,
    42,
    '',
    'https://evil.example/w/acme',
    '//evil.example/w/acme',
    '/w/other/tasks',
    '/w/acme-evil/tasks',
    '/w/acme/../other/tasks',
    '/w/acme/%2e%2e/other',
    '/w/acme/./tasks',
    '/w/acme//tasks',
    '/w/acme\\tasks',
    '/w/acme/tasks\n',
    'w/acme/tasks',
    `/w/acme/${'a'.repeat(RETURN_TO_MAX_LENGTH)}`,
  ])('rejects %j', (value) => {
    expect(parseReturnPath(value, 'acme')).toBeNull();
  });
});

describe('withTaskPanel', () => {
  it('opens the created task and keeps filters', () => {
    expect(withTaskPanel('/w/acme/tasks?priority=high', 7)).toBe(
      '/w/acme/tasks?priority=high&task=7',
    );
  });

  it('replaces the create form with the task', () => {
    expect(withTaskPanel('/w/acme/projects/p/board?task=new', 7)).toBe(
      '/w/acme/projects/p/board?task=7',
    );
  });

  it('closes the panel', () => {
    expect(withTaskPanel('/w/acme/tasks?task=7&comments=all', null)).toBe('/w/acme/tasks');
  });
});
