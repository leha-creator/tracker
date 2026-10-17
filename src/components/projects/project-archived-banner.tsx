import { Archive } from 'lucide-react';
import Link from 'next/link';

const DATE = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

/** Плашка над страницами архивного проекта: доска и статусы только для чтения. */
export function ProjectArchivedBanner({
  archivedAt,
  archivedByName,
  settingsHref,
}: {
  archivedAt: Date;
  archivedByName: string | null;
  /** Ссылка на раздел «Архив» в настройках — только тем, кто управляет проектами. */
  settingsHref?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
    >
      <Archive className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        Проект в архиве с {DATE.format(archivedAt)}
        {archivedByName && ` · ${archivedByName}`}. Доска только для чтения.
      </p>
      {settingsHref && (
        <Link
          href={`${settingsHref}#project-archive`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Восстановить
        </Link>
      )}
    </div>
  );
}
