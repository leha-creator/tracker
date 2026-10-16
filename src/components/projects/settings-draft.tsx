'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Часть страницы настроек со своими несохранёнными правками. */
export interface DraftPart {
  /** Сохраняет правки; `false` — ошибка (часть показывает её у своих полей). */
  save: () => Promise<boolean>;
  /** Возвращает поля к сохранённым значениям. */
  reset: () => void;
}

interface SettingsDraftContextValue {
  register: (id: string, part: RefObject<DraftPart>) => () => void;
  setDirty: (id: string, dirty: boolean) => void;
  requestSave: () => void;
}

const SettingsDraftContext = createContext<SettingsDraftContextValue | null>(null);

/**
 * Общее сохранение страницы настроек: части (форма проекта, строки статусов) регистрируют
 * свои правки, а плавающая панель снизу появляется, только когда что-то изменено, и
 * сохраняет все изменённые части разом.
 */
export function SettingsDraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const parts = useRef(new Map<string, RefObject<DraftPart>>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const dirtyRef = useRef(dirtyIds);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((current) => {
      if (current.has(id) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const register = useCallback(
    (id: string, part: RefObject<DraftPart>) => {
      parts.current.set(id, part);
      return () => {
        parts.current.delete(id);
        setDirty(id, false);
      };
    },
    [setDirty],
  );

  useEffect(() => {
    dirtyRef.current = dirtyIds;
  }, [dirtyIds]);

  const requestSave = useCallback(() => {
    const ids = [...dirtyRef.current];
    if (ids.length === 0) return;
    setFailed(false);
    startTransition(async () => {
      const results = await Promise.all(
        ids.map((id) => parts.current.get(id)?.current.save() ?? Promise.resolve(true)),
      );
      const ok = results.every(Boolean);
      setFailed(!ok);
      if (ok) toast.success('Изменения сохранены');
      router.refresh();
    });
  }, [router]);

  function resetAll() {
    setFailed(false);
    for (const id of dirtyRef.current) parts.current.get(id)?.current.reset();
  }

  const visible = dirtyIds.size > 0 || pending;

  // Ctrl/⌘+S сохраняет, пока есть изменения.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        requestSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, requestSave]);

  const value = useMemo(
    () => ({ register, setDirty, requestSave }),
    [register, setDirty, requestSave],
  );

  return (
    <SettingsDraftContext value={value}>
      {children}
      {visible && (
        <>
          {/* Запас под панелью: она не закрывает конец страницы. */}
          <div aria-hidden className="h-16" />
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div
              role="region"
              aria-label="Несохранённые изменения"
              className="pointer-events-auto flex max-w-full animate-in items-center gap-2 rounded-xl border bg-popover py-2 pr-2 pl-4 text-sm text-popover-foreground shadow-lg duration-200 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
            >
              <span
                role="status"
                className={cn('min-w-0', failed ? 'text-destructive' : 'text-muted-foreground')}
              >
                {/* На узком экране — короткая подпись: панель остаётся в одну строку. */}
                <span className="sm:hidden">{failed ? 'Ошибка' : 'Изменения'}</span>
                <span className="hidden sm:inline">
                  {failed ? 'Не всё сохранилось — проверьте поля' : 'Есть несохранённые изменения'}
                </span>
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={resetAll}>
                Отменить
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={requestSave}>
                {pending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </>
      )}
    </SettingsDraftContext>
  );
}

/**
 * Регистрирует часть страницы в общем сохранении и сообщает, есть ли у неё правки.
 * Возвращает `requestSave` — например, для Enter в поле.
 */
export function useSettingsDraft(id: string, dirty: boolean, part: DraftPart) {
  const context = useContext(SettingsDraftContext);
  if (!context) throw new Error('useSettingsDraft: нет SettingsDraftProvider');
  const partRef = useRef(part);
  useEffect(() => {
    partRef.current = part;
  });
  const { register, setDirty, requestSave } = context;
  useEffect(() => register(id, partRef), [register, id]);
  useEffect(() => {
    setDirty(id, dirty);
  }, [setDirty, id, dirty]);
  return requestSave;
}
