/**
 * Геометрия знака Tasker: галочка в скруглённой плитке, viewBox 32×32.
 * Те же числа записаны в public/brand/*.svg и src/app/icon.svg — тест brand-assets.test.ts их сверяет.
 */
export const MARK_VIEWBOX = '0 0 32 32';
export const MARK_TILE = { size: 32, radius: 9 } as const;
/** Галочка: толщина подобрана так, чтобы знак читался в фавиконе 16 px. */
export const MARK_CHECK = { d: 'M9.5 16.5L14 21L22.5 11.5', strokeWidth: 3.5 } as const;
