import { describe, expect, it } from 'vitest';

import type {
  ChecksState,
  PullRequestState,
  ReviewState,
} from '@/modules/integrations/github/client';
import { STATUS_COLORS } from '@/modules/projects/client';
import { TASK_PRIORITIES } from '@/modules/tasks/client';

import {
  checksTone,
  priorityTone,
  pullRequestTone,
  reviewTone,
  statusTone,
  TONE_FILL,
  TONE_FILL_STRONG,
  TONE_SOFT,
  TONE_TEXT,
  type Tone,
} from './tones';

const PR_STATES: PullRequestState[] = ['open', 'draft', 'merged', 'closed'];
const REVIEW_STATES: ReviewState[] = ['none', 'approved', 'changes_requested'];
const CHECKS_STATES: ChecksState[] = ['none', 'pending', 'success', 'failure'];

const allTones = (): Tone[] => Object.keys(TONE_TEXT) as Tone[];

describe('тона', () => {
  it('у каждого цвета статуса есть тон палитры с насыщенной заливкой', () => {
    for (const color of STATUS_COLORS) {
      const tone = statusTone(color);
      expect(TONE_FILL[tone]).toBeTruthy();
      expect(TONE_FILL_STRONG[color]).toBeTruthy();
    }
  });

  it('у состояний PR, ревью, CI и приоритетов есть тон', () => {
    const tones = [
      ...PR_STATES.map(pullRequestTone),
      ...REVIEW_STATES.map(reviewTone),
      ...CHECKS_STATES.map(checksTone),
      ...TASK_PRIORITIES.map(priorityTone),
    ];
    for (const tone of tones) expect(allTones()).toContain(tone);
  });

  it('срочный приоритет — опасность, высокий — предупреждение', () => {
    expect(priorityTone('urgent')).toBe('destructive');
    expect(priorityTone('high')).toBe('warning');
  });

  it('классы — токены темы без arbitrary values', () => {
    const classes = [
      ...Object.values(TONE_TEXT),
      ...Object.values(TONE_FILL),
      ...Object.values(TONE_FILL_STRONG),
      ...Object.values(TONE_SOFT),
    ];
    for (const value of classes) expect(value).not.toMatch(/\[/);
    for (const tone of allTones()) {
      expect(TONE_FILL[tone]).toBeDefined();
      expect(TONE_SOFT[tone]).toBeDefined();
    }
  });
});
