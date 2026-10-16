'use client';

import { Check, LoaderCircle } from 'lucide-react';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusContextValue {
  status: SaveStatus;
  /** Начало сохранения; возвращает функцию завершения (успех или ошибка). */
  begin: () => (ok: boolean) => void;
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);

/** Общее состояние автосохранения полей задачи — для индикатора в тулбаре. */
export function TaskSaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  // Несколько полей могут сохраняться одновременно: «Сохранено» — когда завершились все.
  const inFlight = useRef(0);
  const failed = useRef(false);

  const begin = useCallback(() => {
    inFlight.current += 1;
    setStatus('saving');
    let done = false;
    return (ok: boolean) => {
      if (done) return;
      done = true;
      inFlight.current -= 1;
      if (!ok) failed.current = true;
      if (inFlight.current === 0) {
        setStatus(failed.current ? 'error' : 'saved');
        failed.current = false;
      }
    };
  }, []);

  const value = useMemo(() => ({ status, begin }), [status, begin]);
  return <SaveStatusContext value={value}>{children}</SaveStatusContext>;
}

export function useTaskSaveStatus(): SaveStatusContextValue {
  const context = use(SaveStatusContext);
  if (!context) throw new Error('useTaskSaveStatus: нет TaskSaveStatusProvider');
  return context;
}

/** «Сохраняем… / Сохранено» рядом с действиями тулбара. Ошибки показывает toast. */
export function TaskSaveIndicator() {
  const { status } = useTaskSaveStatus();
  return (
    <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
      {status === 'saving' && (
        <>
          <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
          Сохраняем…
        </>
      )}
      {status === 'saved' && (
        <>
          <Check aria-hidden className="size-3.5" />
          Сохранено
        </>
      )}
    </span>
  );
}
