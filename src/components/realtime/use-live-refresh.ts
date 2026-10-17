'use client';

import { useEffect, useRef } from 'react';

import { matchesRealtimeFilter, type RealtimeFilter } from '@/shared/realtime/client';

import { useRealtime } from './realtime-provider';

export interface LiveRefreshOptions {
  /** Задержка перед обновлением: пачка событий даёт один `refresh`. */
  debounceMs?: number;
  /** Пока true (перетаскивание, сохранение) — обновление откладывается до снятия паузы. */
  paused?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 400;

/** Обновляет страницу по событиям реалтайма, подходящим фильтру. */
export function useLiveRefresh(filter: RealtimeFilter, options: LiveRefreshOptions = {}): void {
  const realtime = useRealtime();
  const { debounceMs = DEFAULT_DEBOUNCE_MS, paused = false } = options;
  const { projectId, taskId, tasksOnly } = filter;
  const pausedRef = useRef(paused);
  const pending = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && pending.current && realtime) {
      pending.current = false;
      realtime.requestRefresh(debounceMs);
    }
  }, [paused, debounceMs, realtime]);

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (!matchesRealtimeFilter(event, { projectId, taskId, tasksOnly })) return;
      if (pausedRef.current) {
        pending.current = true;
        return;
      }
      realtime.requestRefresh(debounceMs);
    });
  }, [realtime, projectId, taskId, tasksOnly, debounceMs]);
}

/** Компонент-обёртка для серверных страниц: обновлять страницу по событиям фильтра. */
export function LiveRefresh({ debounceMs, ...filter }: RealtimeFilter & { debounceMs?: number }) {
  useLiveRefresh(filter, { debounceMs });
  return null;
}
