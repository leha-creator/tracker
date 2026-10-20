'use client';

import { useRouter } from 'next/navigation';

import { HELP_HREF } from '@/components/help/help-href';
import { useHotkeys } from '@/lib/use-hotkeys';

import { SHORTCUTS } from './shortcuts';

/** Клавиши всего приложения (и вне пространства): «Мои задачи», «Справка». */
export function AppHotkeys() {
  const router = useRouter();
  useHotkeys([
    { keys: SHORTCUTS.goMyTasks.keys, handler: () => router.push('/my-tasks') },
    { keys: SHORTCUTS.goHelp.keys, handler: () => router.push(HELP_HREF) },
  ]);
  return null;
}
