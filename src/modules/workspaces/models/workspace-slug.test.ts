import { describe, expect, it } from 'vitest';

import { resolveSlug, slugify, slugProblem, validateSlug } from './workspace-slug';

describe('slugify', () => {
  it.each([
    ['Отдел продаж', 'otdel-prodazh'],
    ['Щука и Ёж', 'shchuka-i-ezh'],
    ['  My Team!!  ', 'my-team'],
    ['Café Déjà vu', 'cafe-deja-vu'],
    ['Team 42 / Q3', 'team-42-q3'],
    ['🚀🚀', ''],
    ['', ''],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('cuts to 48 characters without trailing dash', () => {
    const slug = slugify(`${'a'.repeat(47)} bbb`);
    expect(slug).toBe('a'.repeat(47));
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});

describe('slugProblem', () => {
  it.each(['team', 'my-team-2', 'abc'])('accepts %s', (slug) => {
    expect(slugProblem(slug)).toBeNull();
  });

  it.each(['ab', 'a'.repeat(49), 'Team', 'my_team', '-team', 'team-', 'my--team', 'new', 'admin'])(
    'rejects %s',
    (slug) => {
      expect(slugProblem(slug)).not.toBeNull();
    },
  );
});

describe('validateSlug', () => {
  it('throws VALIDATION_ERROR with slug field error', () => {
    expect(() => validateSlug('new')).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        fieldErrors: { slug: [expect.any(String)] },
      }),
    );
  });
});

describe('resolveSlug', () => {
  it('prefers requested slug', () => {
    expect(resolveSlug('Отдел продаж', 'sales')).toBe('sales');
  });

  it('generates slug from name', () => {
    expect(resolveSlug('Отдел продаж')).toBe('otdel-prodazh');
  });

  it('asks for manual slug when name gives nothing usable', () => {
    expect(() => resolveSlug('🚀')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => resolveSlug('Новое')).not.toThrow();
    expect(() => resolveSlug('New')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
