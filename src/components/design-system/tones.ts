import type {
  ChecksState,
  PullRequestState,
  ReviewState,
} from '@/modules/integrations/github/client';
import type { StatusColor } from '@/modules/projects/client';
import type { TaskPriority } from '@/modules/tasks/client';

/**
 * Тон — смысловой цвет элемента. Компоненты выбирают тон, а не цвет:
 * семантические тона меняются вместе с темой, тона палитры совпадают с цветами статусов.
 */
export type SemanticTone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';
export type PaletteTone = StatusColor;
export type Tone = SemanticTone | PaletteTone;

// Полные имена классов: Tailwind находит их в исходниках, динамическая сборка не сработала бы.

/** Цвет текста и иконок. Тона палитры светлее семантики — для иконок и точек, не для длинного текста. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  gray: 'text-tone-gray',
  blue: 'text-tone-blue',
  green: 'text-tone-green',
  amber: 'text-tone-amber',
  red: 'text-tone-red',
  violet: 'text-tone-violet',
};

/** Заливка: точки, полосы, сегменты. */
export const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  gray: 'bg-tone-gray',
  blue: 'bg-tone-blue',
  green: 'bg-tone-green',
  amber: 'bg-tone-amber',
  red: 'bg-tone-red',
  violet: 'bg-tone-violet',
};

/** Насыщенная заливка под белым текстом (счётчики). */
export const TONE_FILL_STRONG: Record<PaletteTone, string> = {
  gray: 'bg-tone-gray-strong',
  blue: 'bg-tone-blue-strong',
  green: 'bg-tone-green-strong',
  amber: 'bg-tone-amber-strong',
  red: 'bg-tone-red-strong',
  violet: 'bg-tone-violet-strong',
};

/** Мягкий фон и рамка: плашки, бейджи, сообщения. Текст выбирается отдельно. */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'border-border bg-muted',
  info: 'border-info/30 bg-info/10',
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/35 bg-warning/12',
  destructive: 'border-destructive/30 bg-destructive/10',
  gray: 'border-tone-gray/35 bg-tone-gray/15',
  blue: 'border-tone-blue/35 bg-tone-blue/15',
  green: 'border-tone-green/35 bg-tone-green/15',
  amber: 'border-tone-amber/35 bg-tone-amber/15',
  red: 'border-tone-red/35 bg-tone-red/15',
  violet: 'border-tone-violet/35 bg-tone-violet/15',
};

const PALETTE_TONES = new Set<string>(Object.keys(TONE_FILL_STRONG));

/** Тон палитры (цвет статуса), а не семантический. */
export function isPaletteTone(tone: Tone): tone is PaletteTone {
  return PALETTE_TONES.has(tone);
}

/** Цвет статуса проекта — тон палитры с тем же именем. */
export function statusTone(color: StatusColor): PaletteTone {
  return color;
}

const PULL_REQUEST_TONES: Record<PullRequestState, Tone> = {
  open: 'success',
  draft: 'neutral',
  merged: 'violet',
  closed: 'destructive',
};

export function pullRequestTone(state: PullRequestState): Tone {
  return PULL_REQUEST_TONES[state];
}

const REVIEW_TONES: Record<ReviewState, Tone> = {
  none: 'neutral',
  approved: 'success',
  changes_requested: 'warning',
};

export function reviewTone(state: ReviewState): Tone {
  return REVIEW_TONES[state];
}

const CHECKS_TONES: Record<ChecksState, Tone> = {
  none: 'neutral',
  pending: 'amber',
  success: 'success',
  failure: 'destructive',
};

export function checksTone(state: ChecksState): Tone {
  return CHECKS_TONES[state];
}

const PRIORITY_TONES: Record<TaskPriority, Tone> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'neutral',
  high: 'warning',
  urgent: 'destructive',
};

export function priorityTone(priority: TaskPriority): Tone {
  return PRIORITY_TONES[priority];
}
