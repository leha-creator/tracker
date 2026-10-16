import { describe, expect, it } from 'vitest';

import {
  docsHref,
  documentEditHref,
  documentFileHref,
  documentHref,
  folderHref,
  newNoteHref,
} from './docs-href';

const F = '0199f3a4-1b2c-7d3e-8f40-0000000000f1';

describe('docs hrefs', () => {
  it('builds browse and folder links', () => {
    expect(docsHref('team')).toBe('/w/team/docs');
    expect(folderHref('team', null)).toBe('/w/team/docs');
    expect(folderHref('team', F)).toBe(`/w/team/docs?folder=${F}`);
    expect(docsHref('team', { q: 'план', sort: 'updated' })).toBe(
      '/w/team/docs?q=%D0%BF%D0%BB%D0%B0%D0%BD&sort=updated',
    );
  });

  it('builds document links', () => {
    expect(documentHref('team', 'd1')).toBe('/w/team/docs/d1');
    expect(documentEditHref('team', 'd1')).toBe('/w/team/docs/d1/edit');
    expect(documentFileHref('d1')).toBe('/api/documents/d1/file');
    expect(documentFileHref('d1', { inline: true })).toBe('/api/documents/d1/file?inline=1');
  });

  it('builds the new note link', () => {
    expect(newNoteHref('team')).toBe('/w/team/docs/new');
    expect(newNoteHref('team', { folderId: F, linkTaskId: 't1' })).toBe(
      `/w/team/docs/new?folder=${F}&linkTask=t1`,
    );
  });
});
