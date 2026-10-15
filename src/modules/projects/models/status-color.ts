/** Палитра статусов. В БД хранится ключ; классы Tailwind сопоставляются в UI. */
export const STATUS_COLORS = ['gray', 'blue', 'green', 'amber', 'red', 'violet'] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

export const DEFAULT_STATUS_COLOR: StatusColor = 'gray';

export const STATUS_COLOR_LABELS: Record<StatusColor, string> = {
  gray: 'Серый',
  blue: 'Синий',
  green: 'Зелёный',
  amber: 'Жёлтый',
  red: 'Красный',
  violet: 'Фиолетовый',
};

/** Приводит значение из БД к ключу палитры; неизвестное → серый. */
export function parseStatusColor(value: string | null | undefined): StatusColor {
  return STATUS_COLORS.find((color) => color === value) ?? DEFAULT_STATUS_COLOR;
}
