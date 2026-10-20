import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { PageHeader } from './page-header';

interface NotFoundMessageProps {
  /** Главное действие: куда вернуться. */
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}

/** Сообщение «страница не найдена» — одно для всех not-found.tsx. */
export function NotFoundMessage({ primary, secondary }: NotFoundMessageProps) {
  return (
    <div className="grid max-w-md gap-4 py-10">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <PageHeader title="Страница не найдена" />
      <p className="text-muted-foreground">
        Возможно, её удалили, адрес набран с ошибкой или у вас нет доступа.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        {secondary && (
          <Button asChild variant="ghost">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
