import { describe, expect, it } from 'vitest';

import { findCardColumn, moveCard, prevTaskIdAt } from './board-move';

const card = (taskId: string) => ({ taskId });
const ids = (cards: { taskId: string }[] | undefined) => (cards ?? []).map((item) => item.taskId);

function board() {
  return {
    todo: [card('a'), card('b'), card('c')],
    doing: [card('d')],
    done: [] as { taskId: string }[],
  };
}

describe('findCardColumn', () => {
  it('finds the status of a card', () => {
    expect(findCardColumn(board(), 'd')).toBe('doing');
  });

  it('returns null for an unknown card', () => {
    expect(findCardColumn(board(), 'x')).toBeNull();
  });
});

describe('moveCard', () => {
  it('moves a card to another column at the index', () => {
    const next = moveCard(board(), 'b', 'doing', 0);
    expect(ids(next.todo)).toEqual(['a', 'c']);
    expect(ids(next.doing)).toEqual(['b', 'd']);
  });

  it('moves a card down within a column', () => {
    expect(ids(moveCard(board(), 'a', 'todo', 2).todo)).toEqual(['b', 'c', 'a']);
  });

  it('moves a card up within a column', () => {
    expect(ids(moveCard(board(), 'c', 'todo', 0).todo)).toEqual(['c', 'a', 'b']);
  });

  it('moves a card to an empty column', () => {
    const next = moveCard(board(), 'd', 'done', 0);
    expect(ids(next.doing)).toEqual([]);
    expect(ids(next.done)).toEqual(['d']);
  });

  it('creates a missing column', () => {
    expect(ids(moveCard(board(), 'a', 'new', 0).new)).toEqual(['a']);
  });

  it('clamps an out-of-range index', () => {
    expect(ids(moveCard(board(), 'a', 'doing', 99).doing)).toEqual(['d', 'a']);
    expect(ids(moveCard(board(), 'a', 'doing', -5).doing)).toEqual(['a', 'd']);
  });

  it('does not mutate the input', () => {
    const columns = board();
    const snapshot = structuredClone(columns);
    moveCard(columns, 'a', 'doing', 0);
    expect(columns).toEqual(snapshot);
  });

  it('ignores an unknown card', () => {
    const columns = board();
    expect(moveCard(columns, 'x', 'todo', 0)).toBe(columns);
  });
});

describe('prevTaskIdAt', () => {
  const column = [card('a'), card('b'), card('c')];

  it('returns null at the top of the column', () => {
    expect(prevTaskIdAt(column, 0)).toBeNull();
  });

  it('returns the card above the index', () => {
    expect(prevTaskIdAt(column, 1)).toBe('a');
    expect(prevTaskIdAt(column, 2)).toBe('b');
  });
});
