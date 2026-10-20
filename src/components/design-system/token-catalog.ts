/**
 * Каталог токенов дизайн-системы — единственный TS-список токенов из globals.css с назначением.
 * Из него рисуется страница /admin/design, а тест (token-catalog.test.ts) сверяет его с globals.css:
 * новый токен без записи здесь или без значения в тёмной теме роняет `pnpm check`.
 */

export type TokenGroup = 'surface' | 'text' | 'brand' | 'semantic' | 'tone' | 'chart' | 'layout';

export interface ColorToken {
  /** CSS-переменная без `--`. */
  name: string;
  label: string;
  usage: string;
  group: TokenGroup;
  /** Значение переопределяется в `.dark`. false — одно значение для обеих тем. */
  themed: boolean;
}

export const TOKEN_GROUP_LABELS: Record<TokenGroup, string> = {
  surface: 'Поверхности',
  text: 'Текст и линии',
  brand: 'Бренд и акцент',
  semantic: 'Семантика',
  tone: 'Тона статусов',
  chart: 'Графики',
  layout: 'Раскладка',
};

export const COLOR_TOKENS: readonly ColorToken[] = [
  {
    name: 'background',
    label: 'Фон',
    usage: 'Фон страницы, чуть темнее карточек',
    group: 'surface',
    themed: true,
  },
  {
    name: 'card',
    label: 'Карточка',
    usage: 'Карточки задач, проектов, списков',
    group: 'surface',
    themed: true,
  },
  {
    name: 'popover',
    label: 'Поповер',
    usage: 'Меню, всплывающие панели',
    group: 'surface',
    themed: true,
  },
  {
    name: 'muted',
    label: 'Приглушённый',
    usage: 'Фон вкладок, заглушек, неактивных зон',
    group: 'surface',
    themed: true,
  },
  {
    name: 'secondary',
    label: 'Вторичный',
    usage: 'Вторичные кнопки',
    group: 'surface',
    themed: true,
  },
  {
    name: 'accent',
    label: 'Подсветка',
    usage: 'Наведение и выбранный пункт меню',
    group: 'surface',
    themed: true,
  },
  {
    name: 'sidebar',
    label: 'Боковая панель',
    usage: 'Фон боковых панелей',
    group: 'surface',
    themed: true,
  },
  { name: 'foreground', label: 'Текст', usage: 'Основной текст', group: 'text', themed: true },
  {
    name: 'muted-foreground',
    label: 'Вторичный текст',
    usage: 'Подписи, описания, метаданные',
    group: 'text',
    themed: true,
  },
  { name: 'border', label: 'Рамка', usage: 'Рамки и разделители', group: 'text', themed: true },
  { name: 'input', label: 'Поле', usage: 'Рамки полей ввода', group: 'text', themed: true },
  { name: 'ring', label: 'Фокус', usage: 'Кольцо фокуса', group: 'text', themed: true },
  {
    name: 'primary',
    label: 'Акцент',
    usage: 'Главные кнопки, активные элементы, знак в приложении',
    group: 'brand',
    themed: true,
  },
  {
    name: 'primary-foreground',
    label: 'Текст на акценте',
    usage: 'Текст и иконки на primary',
    group: 'brand',
    themed: true,
  },
  {
    name: 'brand',
    label: 'Бренд',
    usage: 'Только статичные материалы: фавикон, письма, OG. В интерфейсе — primary',
    group: 'brand',
    themed: false,
  },
  {
    name: 'destructive',
    label: 'Опасность',
    usage: 'Удаление, ошибки, срочный приоритет',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'success',
    label: 'Успех',
    usage: 'Успешные операции, подключено',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'success-foreground',
    label: 'Текст на успехе',
    usage: 'Текст на заливке success',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'warning',
    label: 'Предупреждение',
    usage: 'Предупреждения, высокий приоритет, имперсонация',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'warning-foreground',
    label: 'Текст на предупреждении',
    usage: 'Текст на заливке warning',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'info',
    label: 'Информация',
    usage: 'Справочные сообщения',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'info-foreground',
    label: 'Текст на информации',
    usage: 'Текст на заливке info',
    group: 'semantic',
    themed: true,
  },
  {
    name: 'tone-gray',
    label: 'Серый',
    usage: 'Статус «к выполнению», метки',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-blue',
    label: 'Синий',
    usage: 'Статус «в работе», метки',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-green',
    label: 'Зелёный',
    usage: 'Статус «готово», PR открыт, проверки прошли',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-amber',
    label: 'Янтарный',
    usage: 'Ожидание, проверки идут',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-red',
    label: 'Красный',
    usage: 'Блокер, PR закрыт, проверки упали',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-violet',
    label: 'Фиолетовый',
    usage: 'Ревью, PR слит',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-gray-strong',
    label: 'Серый, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-blue-strong',
    label: 'Синий, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-green-strong',
    label: 'Зелёный, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-amber-strong',
    label: 'Янтарный, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-red-strong',
    label: 'Красный, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  {
    name: 'tone-violet-strong',
    label: 'Фиолетовый, насыщенный',
    usage: 'Фон под белым числом',
    group: 'tone',
    themed: false,
  },
  { name: 'chart-1', label: 'График 1', usage: 'Основная серия', group: 'chart', themed: true },
  { name: 'chart-2', label: 'График 2', usage: 'Серии графиков', group: 'chart', themed: true },
  { name: 'chart-3', label: 'График 3', usage: 'Серии графиков', group: 'chart', themed: true },
  { name: 'chart-4', label: 'График 4', usage: 'Серии графиков', group: 'chart', themed: true },
  { name: 'chart-5', label: 'График 5', usage: 'Серии графиков', group: 'chart', themed: true },
];

/**
 * HEX-копии токенов для мест без CSS-переменных (письма, манифест, статичные SVG и иконки).
 * Пересчитаны из oklch светлой темы; тест сверяет `brand` с `--brand`, а `MAIL_COLORS` — с этим списком.
 */
export const STATIC_HEX = {
  /** --brand: oklch(0.5 0.13 270) */
  brand: '#475cad',
  /** --primary в тёмной теме: oklch(0.68 0.12 270) — знак на тёмной вкладке. */
  brandDark: '#7b94e2',
  /** --background: oklch(0.985 0.003 265) */
  background: '#f9fafc',
  /** --background в тёмной теме: oklch(0.17 0.006 265) */
  backgroundDark: '#0e0f12',
  /** --foreground: oklch(0.21 0.015 265) */
  foreground: '#15181f',
  /** --muted-foreground: oklch(0.5 0.016 265) */
  mutedForeground: '#5f636d',
  /** --border: oklch(0.915 0.006 265) */
  border: '#e1e3e7',
} as const;

/** Шкала типографики: готовые классы. h1 — только через PageHeader, h2 — через SectionHeading. */
export const TYPE_SCALE = [
  {
    name: 'h1',
    label: 'Заголовок страницы',
    className: 'text-2xl font-semibold tracking-tight',
    usage: 'PageHeader',
  },
  {
    name: 'h2-section',
    label: 'Раздел страницы',
    className: 'text-lg font-semibold',
    usage: 'SectionHeading size="section"',
  },
  {
    name: 'h2-group',
    label: 'Группа в карточке или панели',
    className: 'text-base font-semibold',
    usage: 'SectionHeading size="group"',
  },
  { name: 'body', label: 'Основной текст', className: 'text-sm', usage: 'Текст интерфейса' },
  {
    name: 'small',
    label: 'Мелкий текст',
    className: 'text-xs text-muted-foreground',
    usage: 'Метаданные, подсказки',
  },
  {
    name: '2xs',
    label: 'Служебный',
    className: 'text-2xs font-medium',
    usage: 'Счётчики, плотные карточки',
  },
] as const;

/** Размеры иконок lucide: только `size-*`. */
export const ICON_SIZES = [
  { className: 'size-3.5', usage: 'Плотные строки, бейджи, метаданные' },
  { className: 'size-4', usage: 'По умолчанию: кнопки, меню, поля' },
  { className: 'size-5', usage: 'Пустые состояния, крупные плитки' },
] as const;

/** Шкала радиусов. Голый `rounded` не используется. */
export const RADII = [
  { className: 'rounded-sm', usage: 'Мелкие элементы внутри чипов' },
  { className: 'rounded-md', usage: 'Чипы, бейджи, инлайн-блоки' },
  { className: 'rounded-lg', usage: 'Кнопки, поля, элементы управления' },
  { className: 'rounded-xl', usage: 'Карточки, контейнеры, пустые состояния' },
  { className: 'rounded-full', usage: 'Аватары, точки статусов' },
] as const;
