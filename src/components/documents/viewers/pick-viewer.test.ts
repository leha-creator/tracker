import { describe, expect, it } from 'vitest';

import { pickViewer, prettyJson } from './pick-viewer';

describe('pickViewer', () => {
  it('shows notes as Markdown', () => {
    expect(pickViewer({ kind: 'note', viewer: null, inlineViewable: false })).toEqual({
      kind: 'note',
    });
  });

  it('uses inline viewers only when the server serves the file inline', () => {
    expect(pickViewer({ kind: 'file', viewer: 'image', inlineViewable: true })).toEqual({
      kind: 'inline',
      viewer: 'image',
    });
    expect(pickViewer({ kind: 'file', viewer: 'pdf', inlineViewable: false })).toEqual({
      kind: 'fallback',
    });
  });

  it('uses text viewers for text files and falls back otherwise', () => {
    expect(pickViewer({ kind: 'file', viewer: 'csv', inlineViewable: false })).toEqual({
      kind: 'text',
      viewer: 'csv',
    });
    expect(pickViewer({ kind: 'file', viewer: null, inlineViewable: false })).toEqual({
      kind: 'fallback',
    });
  });
});

describe('prettyJson', () => {
  it('indents valid JSON and keeps invalid text', () => {
    expect(prettyJson('{"a":[1,2]}')).toEqual({
      text: '{\n  "a": [\n    1,\n    2\n  ]\n}',
      valid: true,
    });
    expect(prettyJson('{oops')).toEqual({ text: '{oops', valid: false });
  });
});
