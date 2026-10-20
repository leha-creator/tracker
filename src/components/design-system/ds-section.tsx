import type { ReactNode } from 'react';

import { SectionHeading } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';

/** Раздел страницы UI-кита: якорь, заголовок, пояснение и образцы. */
export function DsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="grid scroll-mt-20 gap-4">
      <SectionHeading id={`${id}-heading`} title={title} description={description} />
      {children}
    </section>
  );
}

/** Подпись к образцу: что это и где брать. */
export function DsSample({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid content-start gap-2 rounded-xl border bg-card p-4', className)}>
      <div className="flex min-h-10 flex-wrap items-center gap-3">{children}</div>
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Код в подписи: имя компонента или класса. */
export function DsCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-2xs text-foreground">
      {children}
    </code>
  );
}
