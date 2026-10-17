'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

interface TaskNavigationValue {
  /** Номера задач в порядке текущей доски или списка; пусто — порядка нет. */
  getOrder: () => readonly number[];
  setOrder: (owner: symbol, order: readonly number[] | null) => void;
}

const TaskNavigationContext = createContext<TaskNavigationValue | null>(null);

/**
 * Порядок задач страницы для перехода «следующая / предыдущая» в панели задачи (`j` / `k`).
 * Доска и список регистрируют свой порядок; панель — соседняя ветка того же дерева.
 */
export function TaskNavigationProvider({ children }: { children: ReactNode }) {
  const current = useRef<{ owner: symbol; order: readonly number[] } | null>(null);
  const value = useMemo<TaskNavigationValue>(
    () => ({
      getOrder: () => current.current?.order ?? [],
      setOrder: (owner, order) => {
        if (order) current.current = { owner, order };
        else if (current.current?.owner === owner) current.current = null;
      },
    }),
    [],
  );
  return <TaskNavigationContext value={value}>{children}</TaskNavigationContext>;
}

/** Зарегистрировать порядок задач страницы (доска, список); снимается при размонтировании. */
export function useRegisterTaskOrder(order: readonly number[]): void {
  const navigation = useContext(TaskNavigationContext);
  const owner = useRef(Symbol('task-order'));
  const key = order.join(',');
  useEffect(() => {
    if (!navigation) return;
    const id = owner.current;
    navigation.setOrder(id, key === '' ? [] : key.split(',').map(Number));
    return () => navigation.setOrder(id, null);
  }, [navigation, key]);
}

/** Компонент-обёртка для серверных списков. */
export function RegisterTaskOrder({ numbers }: { numbers: number[] }) {
  useRegisterTaskOrder(numbers);
  return null;
}

export function useTaskNavigation(): TaskNavigationValue | null {
  return useContext(TaskNavigationContext);
}
