'use client';

import { PanelRightClose } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';

/** Длительность ухода панели — совпадает с `duration-200` в классах ниже. */
const EXIT_MS = 200;

interface SidePanelProps {
  /** Адрес страницы без параметра панели: сюда ведут клик по затемнению, Esc и «Закрыть». */
  closeHref: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Панель справа поверх слегка затемнённой страницы — как панель задачи, но модальная: фокус
 * внутри, клик по странице или Esc закрывают её. Открыта, пока в адресе есть её параметр.
 * Закрытие сначала проигрывает анимацию, затем меняет адрес — без паузы на ответ сервера.
 */
export function SidePanel({ closeHref, title, description, children }: SidePanelProps) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Страница без панели загружается заранее — после анимации переход мгновенный.
  useEffect(() => {
    router.prefetch(closeHref);
  }, [closeHref, router]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function close() {
    if (!open) return;
    setOpen(false);
    timer.current = setTimeout(
      () => router.push(closeHref, { scroll: false }),
      reducedMotion ? 0 : EXIT_MS,
    );
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 motion-safe:duration-200 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Фокус — в первое поле формы, а не на кнопку «Закрыть» в тулбаре.
            const field =
              event.currentTarget instanceof HTMLElement
                ? event.currentTarget.querySelector<HTMLElement>(
                    'input:not([type="hidden"]):not([type="radio"]), textarea',
                  )
                : null;
            if (!field) return;
            event.preventDefault();
            field.focus();
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto overscroll-contain bg-background text-sm outline-none motion-safe:duration-200 motion-safe:ease-out motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:slide-out-to-right-8 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-right-8 sm:max-w-md sm:border-l sm:shadow-[-8px_0_24px_-12px_oklch(0.3_0.03_265/0.18)]"
        >
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm sm:px-4">
            <Dialog.Title className="min-w-0 flex-1 truncate font-medium">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Закрыть панель"
                title="Закрыть панель"
              >
                <PanelRightClose />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid gap-5 px-4 py-5 sm:px-6">
            {description ? (
              <Dialog.Description className="text-muted-foreground">
                {description}
              </Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
