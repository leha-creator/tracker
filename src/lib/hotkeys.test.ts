import { describe, expect, it } from 'vitest';

import {
  EMPTY_SEQUENCE,
  formatShortcut,
  parseShortcut,
  resolveShortcut,
  SEQUENCE_TIMEOUT_MS,
  strokeFromEvent,
  type KeyEventLike,
} from './hotkeys';

const key = (code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

const bindings = [
  { id: 'goTasks', keys: parseShortcut('g t') },
  { id: 'goDocs', keys: parseShortcut('g d') },
  { id: 'newTask', keys: parseShortcut('c') },
  { id: 'help', keys: parseShortcut('shift+/') },
  { id: 'search', keys: parseShortcut('mod+k') },
];

describe('parseShortcut', () => {
  it('parses letters, sequences and modifiers', () => {
    expect(parseShortcut('g t')).toEqual([
      { code: 'KeyG', shift: false, alt: false, mod: false },
      { code: 'KeyT', shift: false, alt: false, mod: false },
    ]);
    expect(parseShortcut('?')).toEqual([{ code: 'Slash', shift: true, alt: false, mod: false }]);
    expect(parseShortcut('mod+k')).toEqual([{ code: 'KeyK', shift: false, alt: false, mod: true }]);
    expect(parseShortcut('up')[0]?.code).toBe('ArrowUp');
  });

  it('rejects unknown keys', () => {
    expect(() => parseShortcut('ф')).toThrow();
  });
});

describe('resolveShortcut', () => {
  it('matches by physical key in the Russian layout', () => {
    // «с» в русской раскладке — физическая клавиша C.
    const result = resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyC')), 0);
    expect(result).toMatchObject({ match: 'newTask', consumed: true });
  });

  it('completes a sequence within the timeout', () => {
    const first = resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyG')), 0);
    expect(first).toMatchObject({ match: null, consumed: true });
    const second = resolveShortcut(bindings, first.state, strokeFromEvent(key('KeyT')), 500);
    expect(second.match).toBe('goTasks');
    expect(second.state).toEqual(EMPTY_SEQUENCE);
  });

  it('drops an expired sequence', () => {
    const first = resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyG')), 0);
    const late = resolveShortcut(
      bindings,
      first.state,
      strokeFromEvent(key('KeyT')),
      SEQUENCE_TIMEOUT_MS + 1,
    );
    expect(late).toMatchObject({ match: null, consumed: false });
  });

  it('starts over when the next key does not continue the sequence', () => {
    const first = resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyG')), 0);
    expect(resolveShortcut(bindings, first.state, strokeFromEvent(key('KeyC')), 100).match).toBe(
      'newTask',
    );
  });

  it('respects modifiers', () => {
    expect(resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('Slash')), 0).match).toBe(
      null,
    );
    expect(
      resolveShortcut(
        bindings,
        EMPTY_SEQUENCE,
        strokeFromEvent(key('Slash', { shiftKey: true })),
        0,
      ).match,
    ).toBe('help');
    expect(
      resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyK', { metaKey: true })), 0)
        .match,
    ).toBe('search');
    expect(
      resolveShortcut(bindings, EMPTY_SEQUENCE, strokeFromEvent(key('KeyC', { ctrlKey: true })), 0)
        .match,
    ).toBe(null);
  });
});

describe('formatShortcut', () => {
  it('formats hints', () => {
    expect(formatShortcut('g t')).toBe('G T');
    expect(formatShortcut('shift+/')).toBe('?');
    expect(formatShortcut('mod+k')).toBe('Ctrl+K');
    expect(formatShortcut('up')).toBe('↑');
  });
});
