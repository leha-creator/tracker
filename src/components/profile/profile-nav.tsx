'use client';

import { usePathname } from 'next/navigation';

import { TabLink } from '@/components/layout/tab-link';

const TABS = [
  { href: '/profile', label: 'Профиль' },
  { href: '/profile/notifications', label: 'Уведомления' },
  { href: '/profile/account', label: 'Аккаунт' },
  { href: '/profile/tokens', label: 'Токены доступа' },
] as const;

/** Вкладки раздела профиля. */
export function ProfileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы профиля" className="no-scrollbar flex gap-5 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <TabLink key={tab.href} href={tab.href} active={pathname === tab.href} className="h-10">
          {tab.label}
        </TabLink>
      ))}
    </nav>
  );
}
