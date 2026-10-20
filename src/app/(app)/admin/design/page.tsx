import { Suspense } from 'react';

import {
  DESIGN_SECTIONS,
  DesignSystemSections,
} from '@/components/design-system/design-system-sections';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdminOrNotFound } from '@/shared/access';

export default function AdminDesignPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <DesignSection />
    </Suspense>
  );
}

/** Брендбук и UI-кит: только администратору, остальным 404. */
async function DesignSection() {
  await requireAdminOrNotFound('/admin/design');
  return (
    <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Разделы дизайн-системы" className="max-lg:hidden">
        <ul className="sticky top-20 grid gap-1 text-sm">
          {DESIGN_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid min-w-0 gap-6">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Брендбук и UI-кит Tasker собраны из настоящих компонентов приложения: изменение компонента
          сразу видно здесь. Правила — в <code className="font-mono text-xs">docs/design.md</code>,
          для агентов — <code className="font-mono text-xs">.ai-factory/rules/design.md</code>.
        </p>
        <DesignSystemSections />
      </div>
    </div>
  );
}
