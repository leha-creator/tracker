import { describe, expect, it } from 'vitest';

import { createTaskSchema, taskNumberSchema, updateTaskSchema } from './task.schema';

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';
const STATUS_ID = '0192f3a0-0000-7000-8000-0000000000a1';
const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';

describe('createTaskSchema', () => {
  it('turns empty form fields into undefined and defaults priority', () => {
    expect(
      createTaskSchema.parse({
        workspaceId: 'ws',
        title: '  Сделать   отчёт ',
        description: '',
        dueDate: '',
        assigneeId: '',
        projectId: '',
        statusId: '',
      }),
    ).toEqual({
      workspaceId: 'ws',
      title: 'Сделать отчёт',
      description: undefined,
      priority: 'none',
      dueDate: undefined,
      assigneeId: undefined,
      placement: undefined,
    });
  });

  it('builds a placement from project and status', () => {
    expect(
      createTaskSchema.parse({
        workspaceId: 'ws',
        title: 'A',
        projectId: PROJECT_ID,
        statusId: STATUS_ID,
      }).placement,
    ).toEqual({ projectId: PROJECT_ID, statusId: STATUS_ID });
  });

  it('requires both project and status', () => {
    const result = createTaskSchema.safeParse({
      workspaceId: 'ws',
      title: 'A',
      projectId: PROJECT_ID,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['statusId']);
  });

  it.each([
    ['empty title', { title: '   ' }],
    ['too long title', { title: 'x'.repeat(201) }],
    ['impossible date', { dueDate: '2026-02-30' }],
    ['unknown priority', { priority: 'critical' }],
  ])('rejects %s', (_name, patch) => {
    expect(createTaskSchema.safeParse({ workspaceId: 'ws', title: 'A', ...patch }).success).toBe(
      false,
    );
  });
});

describe('updateTaskSchema', () => {
  it('keeps absent fields undefined and clears empty ones', () => {
    expect(
      updateTaskSchema.parse({
        workspaceId: 'ws',
        taskId: TASK_ID,
        dueDate: '',
        assigneeId: '',
        description: '',
      }),
    ).toEqual({
      workspaceId: 'ws',
      taskId: TASK_ID,
      dueDate: null,
      assigneeId: null,
      description: null,
    });
  });

  it('passes through a date and assignee', () => {
    expect(
      updateTaskSchema.parse({
        workspaceId: 'ws',
        taskId: TASK_ID,
        dueDate: '2026-11-01',
        assigneeId: 'user-2',
        priority: 'high',
      }),
    ).toMatchObject({ dueDate: '2026-11-01', assigneeId: 'user-2', priority: 'high' });
  });

  it('rejects a malformed task id', () => {
    expect(updateTaskSchema.safeParse({ workspaceId: 'ws', taskId: '42' }).success).toBe(false);
  });
});

describe('taskNumberSchema', () => {
  it('parses a positive integer', () => {
    expect(taskNumberSchema.parse('42')).toBe(42);
  });

  it.each(['0', 'abc', '-1', '1e3'])('rejects %j', (value) => {
    expect(taskNumberSchema.safeParse(value).success).toBe(false);
  });
});
