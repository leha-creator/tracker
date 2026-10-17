'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef } from 'react';
import { toast } from 'sonner';

import { SHORTCUTS } from '@/components/hotkeys/shortcuts';
import { useHotkeys } from '@/lib/use-hotkeys';

import { useTaskNavigation } from '../task-navigation-context';
import { adjacentTaskNumber } from '../task-navigation';
import { taskPanelHref } from './task-panel-href';

/** Поле задачи, которое открывает клавиша: элемент с `data-hotkey-field` внутри задачи. */
export type HotkeyField = 'status' | 'priority' | 'due' | 'labels' | 'assignee' | 'watch';

const FIELD_KEYS: { field: HotkeyField; keys: string }[] = [
  { field: 'status', keys: SHORTCUTS.fieldStatus.keys },
  { field: 'priority', keys: SHORTCUTS.fieldPriority.keys },
  { field: 'due', keys: SHORTCUTS.fieldDue.keys },
  { field: 'labels', keys: SHORTCUTS.fieldLabels.keys },
  { field: 'assignee', keys: SHORTCUTS.fieldAssignee.keys },
  { field: 'watch', keys: SHORTCUTS.watch.keys },
];

/**
 * Открыть контрол: radix Select открывается с клавиатуры (Enter), а не по `click()`; кнопки
 * (срок, метки, «Следить») — обычным кликом.
 */
function activate(element: HTMLElement) {
  element.focus();
  if (element.getAttribute('role') === 'combobox') {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  } else {
    element.click();
  }
}

interface TaskPanelHotkeysProps {
  taskNumber: number;
  /** Панель поверх доски или списка — работают `j` / `k`; на странице задачи — нет. */
  variant: 'panel' | 'page';
  /** Архивная задача: клавиши, меняющие задачу, выключены. */
  readOnly: boolean;
}

/** Клавиши открытой задачи: соседние задачи (`j` / `k`) и быстрый доступ к полям. */
export function TaskPanelHotkeys({ taskNumber, variant, readOnly }: TaskPanelHotkeysProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigation = useTaskNavigation();
  const anchor = useRef<HTMLSpanElement>(null);

  function go(step: 1 | -1) {
    const next = adjacentTaskNumber(navigation?.getOrder() ?? [], taskNumber, step);
    if (next === null) {
      toast(step === 1 ? 'Это последняя задача' : 'Это первая задача', { duration: 1500 });
      return;
    }
    router.push(taskPanelHref(pathname, searchParams.toString(), next), { scroll: false });
  }

  function openField(field: HotkeyField) {
    const root = anchor.current?.closest('article');
    const target = root?.querySelector<HTMLElement>(
      `[data-hotkey-field="${field}"]:is(button, [role="combobox"]), [data-hotkey-field="${field}"] :is(button, [role="combobox"])`,
    );
    // После текущего нажатия: иначе его keyup/typeahead достаются уже открытому контролу.
    if (target && !target.matches(':disabled')) setTimeout(() => activate(target), 0);
  }

  useHotkeys([
    { keys: SHORTCUTS.nextTask.keys, handler: () => go(1), enabled: variant === 'panel' },
    { keys: SHORTCUTS.prevTask.keys, handler: () => go(-1), enabled: variant === 'panel' },
    ...FIELD_KEYS.map(({ field, keys }) => ({
      keys,
      handler: () => openField(field),
      enabled: !readOnly,
    })),
  ]);

  return <span ref={anchor} hidden />;
}
