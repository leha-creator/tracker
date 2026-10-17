import { describe, expect, it } from 'vitest';

import {
  assertCanAssignLabels,
  assertCanCreateLabel,
  diffLabels,
  labelNameKey,
  normalizeLabelName,
  parseLabelColor,
  TASK_LABEL_NAME_MAX_LENGTH,
  TASK_LABELS_PER_TASK,
  TASK_LABELS_PER_WORKSPACE,
} from './task-label';

describe('normalizeLabelName', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeLabelName('  срочно   в  релиз ')).toBe('срочно в релиз');
  });

  it('rejects empty names, commas and long names', () => {
    expect(() => normalizeLabelName('   ')).toThrow(/Введите/);
    expect(() => normalizeLabelName('a,b')).toThrow(/запятую/);
    expect(() => normalizeLabelName('я'.repeat(TASK_LABEL_NAME_MAX_LENGTH + 1))).toThrow(
      /не длиннее/,
    );
    expect(normalizeLabelName('я'.repeat(TASK_LABEL_NAME_MAX_LENGTH))).toHaveLength(
      TASK_LABEL_NAME_MAX_LENGTH,
    );
  });
});

describe('labelNameKey', () => {
  it('ignores case', () => {
    expect(labelNameKey('Баг')).toBe(labelNameKey('БАГ'));
  });
});

describe('parseLabelColor', () => {
  it('falls back to gray', () => {
    expect(parseLabelColor('red')).toBe('red');
    expect(parseLabelColor('pink')).toBe('gray');
    expect(parseLabelColor(null)).toBe('gray');
  });
});

describe('limits', () => {
  it('limits labels per task and per workspace', () => {
    expect(() => assertCanAssignLabels(TASK_LABELS_PER_TASK)).not.toThrow();
    expect(() => assertCanAssignLabels(TASK_LABELS_PER_TASK + 1)).toThrow(/не больше/);
    expect(() => assertCanCreateLabel(TASK_LABELS_PER_WORKSPACE - 1)).not.toThrow();
    expect(() => assertCanCreateLabel(TASK_LABELS_PER_WORKSPACE)).toThrow(/не больше/);
  });
});

describe('diffLabels', () => {
  it('returns added and removed labels', () => {
    const bug = { id: 'l1', name: 'bug' };
    const ui = { id: 'l2', name: 'ui' };
    const api = { id: 'l3', name: 'api' };
    expect(diffLabels([bug, ui], [ui, api])).toEqual({ added: [api], removed: [bug] });
    expect(diffLabels([bug], [bug])).toEqual({ added: [], removed: [] });
  });
});
