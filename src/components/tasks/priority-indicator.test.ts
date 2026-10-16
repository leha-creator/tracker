import { describe, expect, it } from 'vitest';

import { TASK_PRIORITIES } from '@/modules/tasks/client';

import { isPriorityProminent, priorityLevel } from './priority-level';

describe('priorityLevel', () => {
  it('растёт вместе с приоритетом и не превышает трёх делений', () => {
    expect(TASK_PRIORITIES.map(priorityLevel)).toEqual([0, 1, 2, 3, 3]);
  });
});

describe('isPriorityProminent', () => {
  it('выделяет только высокий и срочный', () => {
    expect(TASK_PRIORITIES.filter(isPriorityProminent)).toEqual(['high', 'urgent']);
  });
});
