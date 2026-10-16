/**
 * Предустановленные иконки пространств и проектов. В БД хранится ключ (или null — не выбрана),
 * картинка и цвет сопоставляются в UI (components/entity-icon).
 */
export const ENTITY_ICONS = [
  'briefcase',
  'monitor',
  'camera',
  'rocket',
  'palette',
  'book',
  'cart',
  'code',
  'home',
  'music',
] as const;
export type EntityIcon = (typeof ENTITY_ICONS)[number];

export const ENTITY_ICON_LABELS: Record<EntityIcon, string> = {
  briefcase: 'Портфель',
  monitor: 'Компьютер',
  camera: 'Камера',
  rocket: 'Ракета',
  palette: 'Палитра',
  book: 'Книга',
  cart: 'Корзина',
  code: 'Код',
  home: 'Дом',
  music: 'Музыка',
};

/** Ключ из БД или формы; неизвестное и пустое → null. */
export function parseEntityIcon(value: string | null | undefined): EntityIcon | null {
  return ENTITY_ICONS.find((icon) => icon === value) ?? null;
}

/**
 * Иконка для показа: выбранная или, если не выбрана, стабильная по id — у старых пространств
 * и проектов иконки разные, а не одна на всех.
 */
export function resolveEntityIcon(value: string | null | undefined, id: string): EntityIcon {
  const parsed = parseEntityIcon(value);
  if (parsed) return parsed;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return ENTITY_ICONS[hash % ENTITY_ICONS.length] ?? ENTITY_ICONS[0];
}
