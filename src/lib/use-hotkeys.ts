'use client';

import { useEffect, useRef } from 'react';

import {
  EMPTY_SEQUENCE,
  isEditableTarget,
  parseShortcut,
  resolveShortcut,
  strokeFromEvent,
  type SequenceState,
} from './hotkeys';

export interface HotkeyBinding {
  /** Запись клавиш: «c», «g t», «shift+/», «up». */
  keys: string;
  handler: (event: KeyboardEvent) => void;
  /** Срабатывать и в полях ввода (по умолчанию — нет). */
  allowInEditable?: boolean;
  /** Срабатывать и при открытом диалоге (по умолчанию — нет). */
  allowInDialog?: boolean;
  enabled?: boolean;
}

/**
 * События, погашенные самими горячими клавишами. Начало последовательности («g») гасит один хук,
 * но его должны увидеть и другие: у каждого свои продолжения («g m» в приложении, «g t» в
 * пространстве). Сработавшая привязка — окончательно.
 */
const handledEvents = new WeakMap<Event, 'prefix' | 'match'>();

function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * Горячие клавиши на `document`. Пропускает уже обработанные события, ввод IME, поля ввода и
 * открытые диалоги (если привязка не разрешает их явно). Привязки можно менять между рендерами
 * без переподписки.
 */
export function useHotkeys(
  bindings: readonly HotkeyBinding[],
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const latest = useRef(bindings);
  const sequence = useRef<SequenceState>(EMPTY_SEQUENCE);

  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.repeat) return;
      if (event.defaultPrevented && handledEvents.get(event) !== 'prefix') return;
      const editable = isEditableTarget(event.target);
      const dialog = isDialogOpen();
      const active = latest.current
        .map((binding, index) => ({ binding, index }))
        .filter(({ binding }) => binding.enabled !== false)
        .filter(({ binding }) => !editable || binding.allowInEditable)
        .filter(({ binding }) => !dialog || binding.allowInDialog);
      if (active.length === 0) {
        sequence.current = EMPTY_SEQUENCE;
        return;
      }
      const result = resolveShortcut(
        active.map(({ binding, index }) => ({
          id: String(index),
          keys: parseShortcut(binding.keys),
        })),
        sequence.current,
        strokeFromEvent(event),
        Date.now(),
      );
      sequence.current = result.state;
      if (!result.consumed) return;
      event.preventDefault();
      if (result.match === null) {
        if (!handledEvents.has(event)) handledEvents.set(event, 'prefix');
        return;
      }
      handledEvents.set(event, 'match');
      latest.current[Number(result.match)]?.handler(event);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
