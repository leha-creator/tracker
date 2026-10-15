import { describe, expect, it } from 'vitest';

import { createProjectSchema, projectIdSchema, updateProjectSchema } from './project.schema';

const PROJECT_ID = '0192f3a0-0000-7000-8000-000000000001';

describe('createProjectSchema', () => {
  it('normalizes name and drops empty description', () => {
    expect(
      createProjectSchema.parse({
        workspaceId: 'ws',
        name: '  Мобильное   приложение ',
        description: '  ',
      }),
    ).toEqual({ workspaceId: 'ws', name: 'Мобильное приложение', description: undefined });
  });

  it('keeps trimmed description', () => {
    expect(
      createProjectSchema.parse({ workspaceId: 'ws', name: 'Сайт', description: ' Лендинг ' })
        .description,
    ).toBe('Лендинг');
  });

  it.each(['', ' a ', 'x'.repeat(81)])('rejects name %j', (name) => {
    expect(createProjectSchema.safeParse({ workspaceId: 'ws', name }).success).toBe(false);
  });

  it('rejects too long description', () => {
    expect(
      createProjectSchema.safeParse({
        workspaceId: 'ws',
        name: 'Сайт',
        description: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });
});

describe('updateProjectSchema / projectIdSchema', () => {
  it('requires UUID project id', () => {
    expect(
      updateProjectSchema.safeParse({ workspaceId: 'ws', projectId: 'abc', name: 'Сайт' }).success,
    ).toBe(false);
    expect(
      updateProjectSchema.safeParse({ workspaceId: 'ws', projectId: PROJECT_ID, name: 'Сайт' })
        .success,
    ).toBe(true);
  });

  it('validates URL param', () => {
    expect(projectIdSchema.safeParse(PROJECT_ID).success).toBe(true);
    expect(projectIdSchema.safeParse('../etc').success).toBe(false);
  });
});
