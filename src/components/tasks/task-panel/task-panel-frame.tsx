'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

interface TaskPanelFrameProps {
  /** Адрес текущей страницы без `?task` — Esc ведёт сюда. */
  closeHref: string;
  label: string;
  /** Смена открытой задачи — фокус переходит в панель. */
  focusKey: string;
  /** В режиме создания фокус забирает поле названия (`autoFocus`). */
  focusPanel: boolean;
  children: ReactNode;
}

/**
 * Панель задачи справа. На lg+ — колонка под шапкой приложения, страница сужается (globals.css);
 * на меньших экранах — поверх страницы на весь экран. Прокрутка у панели своя.
 */
export function TaskPanelFrame({
  closeHref,
  label,
  focusKey,
  focusPanel,
  children,
}: TaskPanelFrameProps) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusPanel) ref.current?.focus({ preventScroll: true });
    ref.current?.scrollTo({ top: 0 });
  }, [focusKey, focusPanel]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Esc уже обработан: закрыт select, меню, диалог или правка поля.
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inPanel = Boolean(target && ref.current?.contains(target));
      // Поле ввода на странице под панелью (поиск списка) — его Esc не закрывает панель.
      if (!inPanel && target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      router.push(closeHref, { scroll: false });
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeHref, router]);

  return (
    <aside
      ref={ref}
      data-task-panel
      tabIndex={-1}
      aria-label={label}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-background outline-none motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-right-8 lg:inset-auto lg:top-(--app-header-h) lg:right-0 lg:bottom-0 lg:z-30 lg:w-(--task-panel-w) lg:border-l lg:shadow-[-8px_0_24px_-12px_oklch(0.3_0.03_265/0.18)]"
    >
      {children}
    </aside>
  );
}

/** Заглушка панели: тулбар, название и строки свойств. */
export function TaskPanelSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="h-12 border-b" />
      <div className="grid gap-5 px-4 py-5 sm:px-6">
        <div className="grid gap-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex gap-4">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
