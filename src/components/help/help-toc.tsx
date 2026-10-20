import type { HelpHeading } from '@/modules/help/client';

/** Оглавление статьи по заголовкам `##` и `###`. */
export function HelpToc({ headings }: { headings: readonly HelpHeading[] }) {
  if (headings.length < 2) return null;
  return (
    <nav aria-label="На этой странице" className="grid gap-2 text-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        На этой странице
      </p>
      <ul className="grid gap-1.5 border-l">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.depth === 3 ? 'pl-6' : 'pl-3'}>
            <a
              href={`#${heading.id}`}
              className="-ml-px block border-l border-transparent text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
