import { describe, expect, it } from 'vitest';

import { ENTITY_ICONS, parseEntityIcon, resolveEntityIcon } from './entity-icon';

describe('entity-icon', () => {
  it('has from 5 to 10 unique icons', () => {
    expect(ENTITY_ICONS.length).toBeGreaterThanOrEqual(5);
    expect(ENTITY_ICONS.length).toBeLessThanOrEqual(10);
    expect(new Set(ENTITY_ICONS).size).toBe(ENTITY_ICONS.length);
  });

  it('parses known keys only', () => {
    expect(parseEntityIcon('camera')).toBe('camera');
    expect(parseEntityIcon('unknown')).toBeNull();
    expect(parseEntityIcon('')).toBeNull();
    expect(parseEntityIcon(null)).toBeNull();
    expect(parseEntityIcon(undefined)).toBeNull();
  });

  it('keeps the chosen icon', () => {
    expect(resolveEntityIcon('rocket', 'any-id')).toBe('rocket');
  });

  it('falls back to a stable icon by id', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    const icon = resolveEntityIcon(null, id);
    expect(ENTITY_ICONS).toContain(icon);
    expect(resolveEntityIcon('bogus', id)).toBe(icon);
    expect(resolveEntityIcon(undefined, id)).toBe(icon);
  });

  it('spreads fallback icons across ids', () => {
    const icons = new Set(
      Array.from({ length: 50 }, (_, index) => resolveEntityIcon(null, `ws-${index}`)),
    );
    expect(icons.size).toBeGreaterThan(3);
  });
});
