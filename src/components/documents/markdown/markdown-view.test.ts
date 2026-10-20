import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  createHeadingSlugger,
  isAllowedImageSrc,
  isExternalUrl,
  safeMarkdownUrl,
} from './markdown-urls';
import { MarkdownView } from './markdown-view';

const render = (source: string) => renderToStaticMarkup(createElement(MarkdownView, { source }));

describe('safeMarkdownUrl', () => {
  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['mailto:team@example.com', 'mailto:team@example.com'],
    ['/w/team/docs/1', '/w/team/docs/1'],
    ['#section', '#section'],
    ['docs/readme.md', 'docs/readme.md'],
    ['?q=1', '?q=1'],
  ])('keeps %s', (input, expected) => {
    expect(safeMarkdownUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox',
    'file:///etc/passwd',
  ])('drops %j', (input) => {
    expect(safeMarkdownUrl(input)).toBe('');
  });
});

describe('url helpers', () => {
  it('detects external links', () => {
    expect(isExternalUrl('https://x.test')).toBe(true);
    expect(isExternalUrl('//x.test')).toBe(true);
    expect(isExternalUrl('/w/a')).toBe(false);
  });

  it('allows images only from own file endpoints', () => {
    expect(isAllowedImageSrc('/api/documents/1/file?inline=1')).toBe(true);
    expect(isAllowedImageSrc('/api/attachments/1?inline=1')).toBe(true);
    expect(isAllowedImageSrc('https://tracker.example/pixel.gif')).toBe(false);
    expect(isAllowedImageSrc('/api/documents/../users/x')).toBe(false);
    expect(isAllowedImageSrc(undefined)).toBe(false);
  });

  it('allows help screenshots only with an explicit prefix', () => {
    expect(isAllowedImageSrc('/help-media/board/board.png')).toBe(false);
    expect(isAllowedImageSrc('/help-media/board/board.png', ['/help-media/'])).toBe(true);
    expect(isAllowedImageSrc('/help-media/../agent-avatar.svg', ['/help-media/'])).toBe(false);
    expect(isAllowedImageSrc('/api/documents/1/file', ['/help-media/'])).toBe(false);
  });

  it('rejects encoded path traversal and malformed escapes', () => {
    const help = ['/help-media/'];
    expect(isAllowedImageSrc('/help-media/%2e%2e/agent-avatar.svg', help)).toBe(false);
    expect(isAllowedImageSrc('/help-media/%2E%2E%2Fagent-avatar.svg', help)).toBe(false);
    expect(isAllowedImageSrc('/help-media/..%5cagent-avatar.svg', help)).toBe(false);
    expect(isAllowedImageSrc('/help-media/a%5c..%5cb.png', help)).toBe(false);
    expect(isAllowedImageSrc('/help-media/%E0%A4%A.png', help)).toBe(false);
    expect(isAllowedImageSrc('/api/documents/abc/file?inline=1')).toBe(true);
  });

  it('builds unique heading ids', () => {
    const slug = createHeadingSlugger();
    expect(slug('Регламент релизов!')).toBe('регламент-релизов');
    expect(slug('Регламент релизов')).toBe('регламент-релизов-1');
    expect(slug('???')).toBe('section');
  });
});

describe('MarkdownView', () => {
  it('never renders raw HTML', () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\nтекст');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('текст');
  });

  it('strips dangerous link targets but keeps safe ones', () => {
    const html = render('[плохая](javascript:alert(1)) и [хорошая](https://example.com)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('turns external images into links and shows own images', () => {
    const html = render(
      '![пиксель](https://evil.test/p.gif)\n\n![схема](/api/documents/abc/file?inline=1)',
    );
    expect(html).not.toContain('<img src="https://evil.test');
    expect(html).toContain('href="https://evil.test/p.gif"');
    expect(html).toContain('<img src="/api/documents/abc/file?inline=1"');
  });

  it('shows help screenshots with a caption only when the prefix is passed', () => {
    const source = '![Доска](/help-media/board/board.png "Доска проекта")';
    expect(render(source)).not.toContain('<img');

    const html = renderToStaticMarkup(
      createElement(MarkdownView, { source, imagePrefixes: ['/help-media/'] }),
    );
    expect(html).toContain('<img src="/help-media/board/board.png"');
    expect(html).toContain('Доска проекта</span>');
    expect(html).not.toContain('<figure');
  });

  it('renders GFM tables, task lists and heading anchors', () => {
    const html = render(
      '# Заголовок\n\n- [x] готово\n- [ ] нет\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
    );
    expect(html).toContain('id="заголовок"');
    expect(html).toContain('<table');
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toContain('<td');
  });
});
