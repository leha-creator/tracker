'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  type ReactNode,
} from 'react';

import {
  createRealtimeEvent,
  parseRealtimeEvent,
  type RealtimeEvent,
} from '@/shared/realtime/client';

type RealtimeSubscriber = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  subscribe: (subscriber: RealtimeSubscriber) => () => void;
  /** Запросить `router.refresh()`: запросы нескольких подписчиков сливаются в один. */
  requestRefresh: (debounceMs: number) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Контекст реалтайма; вне пространства (нет провайдера) — null, подписчики ничего не делают. */
export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

/**
 * Одно соединение SSE на вкладку для текущего пространства (`/api/realtime/w/<slug>`). События —
 * только сигналы: подписчики решают, касается ли их событие, и просят обновить страницу.
 * Скрытая вкладка не обновляется — один раз при возврате, если что-то приходило.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const subscribers = useRef(new Set<RealtimeSubscriber>());
  const refreshTimer = useRef<number | null>(null);
  const refreshDue = useRef(0);
  const pendingWhileHidden = useRef(false);

  const runRefresh = useCallback(() => {
    refreshTimer.current = null;
    if (document.visibilityState !== 'visible') {
      pendingWhileHidden.current = true;
      return;
    }
    router.refresh();
  }, [router]);

  const requestRefresh = useCallback(
    (debounceMs: number) => {
      const due = Date.now() + debounceMs;
      // Уже запланировано раньше — этого достаточно.
      if (refreshTimer.current !== null && refreshDue.current <= due) return;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshDue.current = due;
      refreshTimer.current = window.setTimeout(runRefresh, debounceMs);
    },
    [runRefresh],
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !pendingWhileHidden.current) return;
      pendingWhileHidden.current = false;
      router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [router]);

  const dispatch = useCallback((event: RealtimeEvent) => {
    for (const subscriber of [...subscribers.current]) subscriber(event);
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (subscriber) => {
        subscribers.current.add(subscriber);
        return () => {
          subscribers.current.delete(subscriber);
        };
      },
      requestRefresh,
    }),
    [requestRefresh],
  );

  return (
    <RealtimeContext value={value}>
      {/* useParams — данные URL: без своей границы Suspense он блокировал бы пререндер. */}
      <Suspense fallback={null}>
        <RealtimeConnection dispatch={dispatch} />
      </Suspense>
      {children}
    </RealtimeContext>
  );
}

/** Соединение SSE текущего пространства из адреса; смена пространства — новое соединение. */
function RealtimeConnection({ dispatch }: { dispatch: (event: RealtimeEvent) => void }) {
  const { workspaceSlug } = useParams<{ workspaceSlug?: string }>();

  useEffect(() => {
    if (!workspaceSlug || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/realtime/w/${encodeURIComponent(workspaceSlug)}`);
    let connectedOnce = false;

    const onReady = () => {
      // Переподключение: события за время обрыва потеряны — обновиться всем.
      if (connectedOnce) {
        dispatch(
          createRealtimeEvent({ workspaceId: '', kind: 'resync', projectIds: [], actorId: null }),
        );
      }
      connectedOnce = true;
    };
    const onTask = (message: MessageEvent<string>) => {
      const event = parseRealtimeEvent(message.data);
      if (event) dispatch(event);
    };
    // Доступ к пространству потерян — не переподключаться.
    const onRevoked = () => source.close();

    source.addEventListener('ready', onReady);
    source.addEventListener('task', onTask);
    source.addEventListener('revoked', onRevoked);
    // Ответ не 200 (нет сессии или доступа, лимит) браузер не повторяет — readyState CLOSED;
    // сетевой обрыв браузер переподключает сам.
    return () => source.close();
  }, [workspaceSlug, dispatch]);

  return null;
}
