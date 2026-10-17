/**
 * Горячие клавиши: разбор записи («g t», «shift+/», «mod+k»), сопоставление с событием и
 * последовательности. Сравнение идёт по `event.code` (физическая клавиша), а не по `event.key`:
 * в русской раскладке `key` — кириллица, а клавиши должны работать в любой раскладке.
 */

/** Окно ввода второй клавиши последовательности («g», затем «t»). */
export const SEQUENCE_TIMEOUT_MS = 1000;

export interface KeyStroke {
  code: string;
  shift: boolean;
  alt: boolean;
  /** Ctrl или ⌘. */
  mod: boolean;
}

/** Минимум полей KeyboardEvent, нужных для сопоставления (упрощает тесты). */
export interface KeyEventLike {
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

const NAMED_CODES: Record<string, string> = {
  '/': 'Slash',
  '.': 'Period',
  ',': 'Comma',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

function codeOf(key: string): string {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  const named = NAMED_CODES[key];
  if (!named) throw new Error(`Unknown key in shortcut: ${key}`);
  return named;
}

function parseStroke(spec: string): KeyStroke {
  const parts = spec.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  // «?» — это Shift + «/» на любой раскладке клавиатуры с US-позицией клавиши.
  if (key === '?') return { code: 'Slash', shift: true, alt: false, mod: parts.includes('mod') };
  return {
    code: codeOf(key),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    mod: parts.includes('mod'),
  };
}

/** «g t» → два нажатия; «shift+/» → одно с модификатором. */
export function parseShortcut(spec: string): KeyStroke[] {
  return spec.trim().split(/\s+/).map(parseStroke);
}

export function strokeFromEvent(event: KeyEventLike): KeyStroke {
  return {
    code: event.code,
    shift: event.shiftKey,
    alt: event.altKey,
    mod: event.ctrlKey || event.metaKey,
  };
}

const sameStroke = (a: KeyStroke, b: KeyStroke) =>
  a.code === b.code && a.shift === b.shift && a.alt === b.alt && a.mod === b.mod;

function startsWith(keys: readonly KeyStroke[], prefix: readonly KeyStroke[]): boolean {
  return prefix.length <= keys.length && prefix.every((stroke, i) => sameStroke(stroke, keys[i]!));
}

export interface SequenceState {
  pending: KeyStroke[];
  at: number;
}

export const EMPTY_SEQUENCE: SequenceState = { pending: [], at: 0 };

export interface ShortcutBinding<Id extends string = string> {
  id: Id;
  keys: readonly KeyStroke[];
}

export interface ShortcutResolution<Id extends string> {
  /** Сработавшая привязка; null — нет. */
  match: Id | null;
  /** Нажатие начало или продолжило последовательность — событие стоит погасить. */
  consumed: boolean;
  state: SequenceState;
}

function resolveFrom<Id extends string>(
  bindings: readonly ShortcutBinding<Id>[],
  candidate: KeyStroke[],
  now: number,
): ShortcutResolution<Id> | null {
  const exact = bindings.find(
    (binding) => binding.keys.length === candidate.length && startsWith(binding.keys, candidate),
  );
  if (exact) return { match: exact.id, consumed: true, state: EMPTY_SEQUENCE };
  if (
    bindings.some(
      (binding) => binding.keys.length > candidate.length && startsWith(binding.keys, candidate),
    )
  ) {
    return { match: null, consumed: true, state: { pending: candidate, at: now } };
  }
  return null;
}

/**
 * Очередное нажатие: продолжает начатую последовательность (если не истекло окно) или начинает
 * новую. Нажатие, не подходящее ни к чему, сбрасывает состояние.
 */
export function resolveShortcut<Id extends string>(
  bindings: readonly ShortcutBinding<Id>[],
  state: SequenceState,
  stroke: KeyStroke,
  now: number,
): ShortcutResolution<Id> {
  const alive = state.pending.length > 0 && now - state.at <= SEQUENCE_TIMEOUT_MS;
  if (alive) {
    const continued = resolveFrom(bindings, [...state.pending, stroke], now);
    if (continued) return continued;
  }
  return (
    resolveFrom(bindings, [stroke], now) ?? { match: null, consumed: false, state: EMPTY_SEQUENCE }
  );
}

const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
]);

/** Цель события — поле ввода: клавиши без модификаторов там печатают текст, а не командуют. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  const field = target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="textbox"]',
  );
  if (!field) return false;
  if (field instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(field.type);
  return true;
}

/** Подпись для подсказок: «g t» → «G T», «shift+/» → «?». */
export function formatShortcut(spec: string): string {
  return spec
    .trim()
    .split(/\s+/)
    .map((stroke) =>
      stroke === 'shift+/'
        ? '?'
        : stroke
            .split('+')
            .map((part) =>
              part === 'mod' ? 'Ctrl' : part.length === 1 ? part.toUpperCase() : part,
            )
            .map(
              (part) =>
                ({
                  up: '↑',
                  down: '↓',
                  left: '←',
                  right: '→',
                  enter: 'Enter',
                  escape: 'Esc',
                  space: 'Space',
                  shift: 'Shift',
                })[part] ?? part,
            )
            .join('+'),
    )
    .join(' ');
}
