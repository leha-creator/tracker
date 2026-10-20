'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { helpArticleHref } from '@/components/help/help-href';
import { useHotkeys } from '@/lib/use-hotkeys';

import { SHORTCUTS, shortcutGroups } from './shortcuts';

/** Событие окна: открыть справку (пункт меню пользователя). */
export const OPEN_SHORTCUTS_EVENT = 'tasker:open-shortcuts';

export function openShortcutsDialog(): void {
  window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
}

const GROUPS = shortcutGroups();

/** Справка по горячим клавишам: «?» в любом месте приложения или пункт меню пользователя. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useHotkeys([{ keys: SHORTCUTS.help.keys, handler: () => setOpen((value) => !value) }]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Горячие клавиши</DialogTitle>
          <DialogDescription>
            Работают в любой раскладке. Одиночные клавиши не срабатывают, пока курсор в поле ввода.{' '}
            <Link
              href={helpArticleHref('search-and-shortcuts')}
              onClick={() => setOpen(false)}
              className="font-medium text-primary underline underline-offset-4 hover:no-underline"
            >
              Подробнее в справке
            </Link>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {GROUPS.map(({ group, items }, index) => (
            <section
              key={group}
              aria-labelledby={`shortcuts-group-${index}`}
              className="grid content-start gap-1.5"
            >
              <h3
                id={`shortcuts-group-${index}`}
                className="text-xs font-medium text-muted-foreground"
              >
                {group}
              </h3>
              <dl className="grid gap-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <dt>{item.label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
