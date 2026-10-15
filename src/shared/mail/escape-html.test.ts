import { describe, expect, it } from 'vitest';

import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes quotes and ampersands', () => {
    expect(escapeHtml(`Tom & "Jerry's"`)).toBe('Tom &amp; &quot;Jerry&#39;s&quot;');
  });

  it('keeps plain text unchanged', () => {
    expect(escapeHtml('Отдел продаж')).toBe('Отдел продаж');
  });
});
