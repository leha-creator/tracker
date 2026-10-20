/**
 * Целостность справки на реальных файлах: у каждой статьи есть Markdown, картинки лежат в
 * public/help-media/, ссылки и якоря ведут на существующие статьи и заголовки. Падает, если
 * скриншот удалили или переименовали, а статья на него ссылается.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createHeadingSlugger } from '@/components/documents/markdown/markdown-urls';
import { MarkdownView } from '@/components/documents/markdown/markdown-view';

import { extractHeadings, extractHelpLinks, extractImageRefs, HELP_ARTICLES } from './models';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content', 'help');
const PUBLIC_DIR = path.join(ROOT, 'public');

const articles = HELP_ARTICLES.map((meta) => {
  const file = path.join(CONTENT_DIR, `${meta.slug}.md`);
  return { meta, file, markdown: existsSync(file) ? readFileSync(file, 'utf8') : null };
});

/** Все id заголовков статьи (любого уровня) — якорем может быть и `####`. */
function headingIds(markdown: string): Set<string> {
  const slug = createHeadingSlugger();
  const ids = new Set<string>();
  // extractHeadings отдаёт только ##/###, но slugger видит все уровни: собираем его вызовы.
  extractHeadings(markdown, (text) => {
    const id = slug(text);
    ids.add(id);
    return id;
  });
  return ids;
}

describe('help content', () => {
  it('has a Markdown file for every catalog article and no stray files', () => {
    for (const article of articles) expect(article.markdown, article.file).not.toBeNull();
    const files = readdirSync(CONTENT_DIR).filter((name) => name.endsWith('.md'));
    expect(files.sort()).toEqual(HELP_ARTICLES.map((a) => `${a.slug}.md`).sort());
  });

  it.each(articles.map((a) => [a.meta.slug, a] as const))(
    '%s: images exist under /help-media/',
    (_slug, article) => {
      for (const ref of extractImageRefs(article.markdown ?? '')) {
        expect(ref, `${article.meta.slug}: ${ref}`).toMatch(/^\/help-media\/[^?#]+\.(png|webp)$/);
        expect(ref.includes('..'), ref).toBe(false);
        expect(existsSync(path.join(PUBLIC_DIR, ref)), `${article.meta.slug}: ${ref}`).toBe(true);
      }
    },
  );

  it.each(articles.map((a) => [a.meta.slug, a] as const))(
    '%s: help links point to existing articles and headings',
    (_slug, article) => {
      for (const link of extractHelpLinks(article.markdown ?? '')) {
        const target = articles.find((a) => a.meta.slug === link.slug);
        expect(target, `${article.meta.slug} → /help/${link.slug}`).toBeDefined();
        if (link.anchor) {
          expect(
            headingIds(target?.markdown ?? '').has(link.anchor),
            `${article.meta.slug} → /help/${link.slug}#${link.anchor}`,
          ).toBe(true);
        }
      }
    },
  );

  it.each(articles.map((a) => [a.meta.slug, a] as const))(
    '%s: table of contents ids match rendered headings',
    (_slug, article) => {
      const markdown = article.markdown ?? '';
      const html = renderToStaticMarkup(
        createElement(MarkdownView, { source: markdown, imagePrefixes: ['/help-media/'] }),
      );
      for (const heading of extractHeadings(markdown, createHeadingSlugger())) {
        expect(html, `${article.meta.slug}: #${heading.id}`).toContain(`id="${heading.id}"`);
      }
    },
  );
});
