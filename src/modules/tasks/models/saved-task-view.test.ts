import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors/app-error';

import {
  assertCanCreateView,
  canonicalViewParams,
  normalizeViewName,
  SAVED_VIEW_NAME_MAX_LENGTH,
  SAVED_VIEWS_PER_SCOPE,
  viewNameKey,
} from './saved-task-view';

const PROJECT_ID = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('normalizeViewName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeViewName('  Мои   срочные ')).toBe('Мои срочные');
  });

  it('rejects empty and too long names with a field error', () => {
    expect(() => normalizeViewName('   ')).toThrow(ValidationError);
    const long = 'я'.repeat(SAVED_VIEW_NAME_MAX_LENGTH + 1);
    try {
      normalizeViewName(long);
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationError).fieldErrors?.name).toHaveLength(1);
    }
    expect(normalizeViewName('я'.repeat(SAVED_VIEW_NAME_MAX_LENGTH))).toHaveLength(
      SAVED_VIEW_NAME_MAX_LENGTH,
    );
  });

  it('compares names without case', () => {
    expect(viewNameKey('Срочные')).toBe(viewNameKey('СРОЧНЫЕ'));
  });
});

describe('assertCanCreateView', () => {
  it('allows up to the limit', () => {
    expect(() => assertCanCreateView(SAVED_VIEWS_PER_SCOPE - 1)).not.toThrow();
    expect(() => assertCanCreateView(SAVED_VIEWS_PER_SCOPE)).toThrow(ValidationError);
  });
});

describe('canonicalViewParams', () => {
  it('drops the page, invalid values and keeps a stable key order', () => {
    expect(canonicalViewParams('?page=3&priority=high&q=шапка&due=bad', 'workspace')).toBe(
      'q=%D1%88%D0%B0%D0%BF%D0%BA%D0%B0&priority=high',
    );
  });

  it('drops parameters of another scope', () => {
    expect(canonicalViewParams(`status=${PROJECT_ID}&project=${PROJECT_ID}`, 'project')).toBe(
      `status=${PROJECT_ID}`,
    );
    expect(canonicalViewParams(`label=${PROJECT_ID}&category=todo`, 'mine')).toBe('category=todo');
  });

  it('the same filter in a different order is the same string', () => {
    expect(canonicalViewParams('due=week&priority=high', 'workspace')).toBe(
      canonicalViewParams('priority=high&due=week', 'workspace'),
    );
  });
});
