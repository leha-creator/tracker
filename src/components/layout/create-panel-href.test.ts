import { describe, expect, it } from 'vitest';

import {
  isCreatePanelOpen,
  NEW_WORKSPACE_HREF,
  newProjectHref,
  type CreatePanelKind,
} from './create-panel-href';

describe('create-panel-href', () => {
  it('builds panel addresses', () => {
    expect(NEW_WORKSPACE_HREF).toBe('/?create=workspace');
    expect(newProjectHref('sales')).toBe('/w/sales?create=project');
  });

  it.each([
    [undefined, 'workspace', false],
    ['workspace', 'workspace', true],
    ['project', 'workspace', false],
    [['project', 'workspace'], 'project', true],
    [['workspace', 'project'], 'project', false],
    ['', 'project', false],
  ] satisfies [string | string[] | undefined, CreatePanelKind, boolean][])(
    'isCreatePanelOpen(%j, %s) → %s',
    (value, kind, expected) => {
      expect(isCreatePanelOpen(value, kind)).toBe(expected);
    },
  );
});
