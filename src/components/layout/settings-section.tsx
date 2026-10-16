import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Секция страницы настроек без карточки: на lg+ слева заголовок и пояснение, справа поля;
 * секции разделяет тонкая линия (у родителя — `divide-y`, см. SettingsSections).
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="grid gap-x-10 gap-y-4 py-6 first:pt-2 lg:grid-cols-[15rem_minmax(0,48rem)]">
      <div className="grid content-start gap-1">
        <h2 className="text-base font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Список секций настроек, разделённых тонкой линией. */
export function SettingsSections({ children }: { children: ReactNode }) {
  return <div className="grid w-full divide-y divide-foreground/[0.07]">{children}</div>;
}
