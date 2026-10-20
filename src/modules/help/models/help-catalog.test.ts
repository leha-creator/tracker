import { describe, expect, it } from 'vitest';

import {
  findHelpArticle,
  getAdjacentArticles,
  groupArticlesBySection,
  HELP_ARTICLES,
  HELP_SECTIONS,
} from './help-catalog';

describe('help catalog', () => {
  it('has unique kebab-case slugs', () => {
    const slugs = HELP_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('places every article into a known section and leaves no section empty', () => {
    const sectionIds = new Set(HELP_SECTIONS.map((section) => section.id));
    for (const article of HELP_ARTICLES) expect(sectionIds.has(article.section)).toBe(true);

    const groups = groupArticlesBySection();
    expect(groups.map((group) => group.section.id)).toEqual(HELP_SECTIONS.map((s) => s.id));
    expect(groups.flatMap((group) => group.articles)).toHaveLength(HELP_ARTICLES.length);
  });

  it('keeps reading order inside sections the same as the catalog order', () => {
    const flat = groupArticlesBySection().flatMap((group) => group.articles);
    expect(flat.map((a) => a.slug)).toEqual(HELP_ARTICLES.map((a) => a.slug));
  });

  it('finds articles by slug', () => {
    expect(findHelpArticle('board')?.title).toBe('Доска');
    expect(findHelpArticle('../etc/passwd')).toBeNull();
  });

  it('returns neighbours and nulls at the edges', () => {
    const first = HELP_ARTICLES[0]!;
    const last = HELP_ARTICLES.at(-1)!;
    expect(getAdjacentArticles(first.slug).prev).toBeNull();
    expect(getAdjacentArticles(first.slug).next?.slug).toBe(HELP_ARTICLES[1]!.slug);
    expect(getAdjacentArticles(last.slug).next).toBeNull();
    expect(getAdjacentArticles('missing')).toEqual({ prev: null, next: null });
  });
});
