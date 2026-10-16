import { describe, expect, it } from 'vitest';

import {
  aggregateChecksState,
  aggregateReviewState,
  commitTitle,
  diffAutoLinks,
  findTaskReferences,
  groupReferencesByKey,
  mergeReviewerState,
  pickBadgeState,
  pullRequestTransition,
  shouldAutomate,
  suggestBranchName,
  TASK_REFERENCES_LIMIT,
  toPullRequestState,
  toReviewerState,
} from '.';

describe('findTaskReferences', () => {
  it.each([
    ['tsk-42-fix-login', [{ key: 'TSK', number: 42 }]],
    ['feature/TSK-42', [{ key: 'TSK', number: 42 }]],
    ['[TSK-42] Fix login', [{ key: 'TSK', number: 42 }]],
    ['TSK-42: fix', [{ key: 'TSK', number: 42 }]],
    ['Closes web2-7.', [{ key: 'WEB2', number: 7 }]],
    ['TSK-0', []],
    ['TSK-012', []],
    ['TSK-12abc', []],
    ['T-12', []],
    ['ABCDEFGHIJK-1', []],
    ['2TSK-1', []],
    ['no refs here', []],
  ])('%j', (text, expected) => {
    expect(findTaskReferences(text)).toEqual(expected);
  });

  it('treats a key glued to a word as another key', () => {
    expect(findTaskReferences('xTSK-1')).toEqual([{ key: 'XTSK', number: 1 }]);
  });

  it('dedupes across texts and keeps order of first appearance', () => {
    expect(findTaskReferences('tsk-2-and-tsk-1', 'TSK-1 and OPS-3', null, undefined, '')).toEqual([
      { key: 'TSK', number: 2 },
      { key: 'TSK', number: 1 },
      { key: 'OPS', number: 3 },
    ]);
  });

  it('stops at the limit', () => {
    const text = Array.from({ length: 80 }, (_, i) => `TSK-${i + 1}`).join(' ');
    expect(findTaskReferences(text)).toHaveLength(TASK_REFERENCES_LIMIT);
  });

  it('groups numbers by key', () => {
    expect(groupReferencesByKey(findTaskReferences('TSK-1 OPS-2 TSK-3'))).toEqual(
      new Map([
        ['TSK', [1, 3]],
        ['OPS', [2]],
      ]),
    );
  });
});

describe('pull request state', () => {
  it.each([
    [{ state: 'open' as const, draft: false }, 'open'],
    [{ state: 'open' as const, draft: true }, 'draft'],
    [{ state: 'closed' as const, merged: true }, 'merged'],
    [{ state: 'closed' as const, merged_at: '2026-10-16T10:00:00Z' }, 'merged'],
    [{ state: 'closed' as const, merged: false }, 'closed'],
  ])('%j → %s', (pr, expected) => {
    expect(toPullRequestState(pr)).toBe(expected);
  });

  it('picks the most visible badge state', () => {
    expect(pickBadgeState(['closed', 'merged', 'draft'])).toBe('draft');
    expect(pickBadgeState(['merged', 'open'])).toBe('open');
    expect(pickBadgeState([])).toBeNull();
  });

  it.each([
    [null, 'open', 'opened'],
    [null, 'draft', null],
    ['draft', 'open', 'opened'],
    ['closed', 'open', 'opened'],
    ['open', 'open', null],
    ['open', 'merged', 'merged'],
    [null, 'merged', 'merged'],
    ['merged', 'merged', null],
    ['open', 'closed', null],
    ['open', 'draft', null],
  ] as const)('transition %s → %s = %s', (previous, next, expected) => {
    expect(pullRequestTransition(previous, next)).toBe(expected);
  });
});

describe('review state', () => {
  it('parses reviewer state case-insensitively', () => {
    expect(toReviewerState('APPROVED')).toBe('approved');
    expect(toReviewerState('changes_requested')).toBe('changes_requested');
    expect(toReviewerState('pending')).toBeNull();
  });

  it('keeps approval or change request after a plain comment, dismiss removes it', () => {
    expect(mergeReviewerState('approved', 'commented')).toBe('approved');
    expect(mergeReviewerState('changes_requested', 'commented')).toBe('changes_requested');
    expect(mergeReviewerState(null, 'commented')).toBe('commented');
    expect(mergeReviewerState('approved', 'dismissed')).toBe('dismissed');
    expect(mergeReviewerState('changes_requested', 'approved')).toBe('approved');
  });

  it('aggregates reviewers', () => {
    expect(aggregateReviewState([])).toBe('none');
    expect(aggregateReviewState([{ state: 'commented' }, { state: 'dismissed' }])).toBe('none');
    expect(aggregateReviewState([{ state: 'approved' }, { state: 'commented' }])).toBe('approved');
    expect(aggregateReviewState([{ state: 'approved' }, { state: 'changes_requested' }])).toBe(
      'changes_requested',
    );
  });
});

describe('aggregateChecksState', () => {
  const done = (conclusion: string) => ({ status: 'completed', conclusion });

  it.each([
    [[], 'none'],
    [[done('success'), done('neutral')], 'success'],
    [[done('success'), { status: 'in_progress', conclusion: null }], 'pending'],
    [[done('failure'), { status: 'queued', conclusion: null }], 'failure'],
    [[done('timed_out')], 'failure'],
    [[done('cancelled'), done('skipped')], 'none'],
    [[done('cancelled'), done('success')], 'success'],
  ])('%j → %s', (suites, expected) => {
    expect(aggregateChecksState(suites)).toBe(expected);
  });
});

describe('shouldAutomate', () => {
  const base = { currentStatusId: 's1', targetStatusId: 's2' };

  it('moves only forward by category', () => {
    expect(
      shouldAutomate({ ...base, currentCategory: 'todo', targetCategory: 'in_progress' }),
    ).toBe(true);
    expect(
      shouldAutomate({ ...base, currentCategory: 'in_progress', targetCategory: 'done' }),
    ).toBe(true);
    expect(
      shouldAutomate({ ...base, currentCategory: 'done', targetCategory: 'in_progress' }),
    ).toBe(false);
    expect(
      shouldAutomate({ ...base, currentCategory: 'in_progress', targetCategory: 'in_progress' }),
    ).toBe(false);
  });

  it('does nothing for the same status', () => {
    expect(
      shouldAutomate({
        currentStatusId: 's1',
        targetStatusId: 's1',
        currentCategory: 'todo',
        targetCategory: 'done',
      }),
    ).toBe(false);
  });
});

describe('suggestBranchName', () => {
  it('prefixes transliterated title with lowercase key', () => {
    expect(suggestBranchName('TSK', 'Починить вход через GitHub!')).toBe(
      'tsk-pochinit-vkhod-cherez-github',
    );
  });

  it('cuts long titles on a word boundary within 50 chars', () => {
    const name = suggestBranchName(
      'TSK',
      'Очень длинное название задачи про интеграцию с внешними сервисами',
    );
    expect(name.length).toBeLessThanOrEqual(50);
    expect(name).toMatch(/^tsk-[a-z0-9-]*[a-z0-9]$/);
    expect(name.startsWith('tsk-ochen-dlinnoe')).toBe(true);
  });

  it('returns key alone for titles without letters', () => {
    expect(suggestBranchName('OPS', '🚀🚀')).toBe('ops');
  });
});

describe('commitTitle', () => {
  it('keeps the first line, trimmed and limited', () => {
    expect(commitTitle('  fix: login  \n\nBody text')).toBe('fix: login');
    const long = commitTitle('x'.repeat(300));
    expect(long).toHaveLength(200);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('diffAutoLinks', () => {
  it('adds new references and removes stale auto links only', () => {
    const current = [
      { taskId: 't1', source: 'auto' as const, dismissed: false },
      { taskId: 't2', source: 'auto' as const, dismissed: false },
      { taskId: 't3', source: 'manual' as const, dismissed: false },
      { taskId: 't4', source: 'auto' as const, dismissed: true },
    ];
    expect(diffAutoLinks(current, new Set(['t1', 't4', 't5']))).toEqual({
      add: ['t5'],
      remove: ['t2'],
    });
  });

  it('does not restore dismissed links and keeps manual links without references', () => {
    const current = [
      { taskId: 't1', source: 'auto' as const, dismissed: true },
      { taskId: 't2', source: 'manual' as const, dismissed: false },
    ];
    expect(diffAutoLinks(current, new Set(['t1']))).toEqual({ add: [], remove: [] });
  });
});
