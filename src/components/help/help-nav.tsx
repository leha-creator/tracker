'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { groupArticlesBySection } from '@/modules/help/client';

import { HELP_HREF, helpArticleHref } from './help-href';

const GROUPS = groupArticlesBySection();

function HelpNavLinks({ pathname }: { pathname: string }) {
  return (
    <div className="grid gap-5">
      <Link
        href={HELP_HREF}
        aria-current={pathname === HELP_HREF ? 'page' : undefined}
        className={cn(
          'rounded-md px-2 py-1 text-sm font-medium hover:bg-muted',
          pathname === HELP_HREF && 'bg-muted',
        )}
      >
        Все статьи
      </Link>
      {GROUPS.map(({ section, articles }) => (
        <div key={section.id} className="grid gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </p>
          <ul className="grid gap-0.5">
            {articles.map((article) => {
              const href = helpArticleHref(article.slug);
              const active = pathname === href;
              return (
                <li key={article.slug} className="min-w-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                      active && 'bg-muted font-medium text-foreground',
                    )}
                  >
                    {article.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Навигация по справке. На широких экранах — колонка слева, на узких — раскрывающийся
 * список «Все статьи» над статьёй (оглавление `/help` и так показывает всё).
 */
export function HelpNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Статьи справки" className="min-w-0">
      <details className="rounded-lg border lg:hidden">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Все статьи</summary>
        <div className="border-t p-2">
          <HelpNavLinks pathname={pathname} />
        </div>
      </details>
      <div className="hidden lg:block">
        <HelpNavLinks pathname={pathname} />
      </div>
    </nav>
  );
}
