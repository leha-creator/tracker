'use client';

import { useRouter } from 'next/navigation';

import { useHotkeys } from '@/lib/use-hotkeys';

import { SHORTCUTS } from './shortcuts';

/** Клавиши всего приложения (и вне пространства): «Мои задачи». */
export function AppHotkeys() {
  const router = useRouter();
  useHotkeys([{ keys: SHORTCUTS.goMyTasks.keys, handler: () => router.push('/my-tasks') }]);
  return null;
}
