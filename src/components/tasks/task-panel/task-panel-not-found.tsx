import Link from 'next/link';

import { SectionHeading } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

import { TaskCloseLink, TaskToolbar } from './task-toolbar';

/** Задача удалена или из чужого пространства: сообщение в панели, страница под ней остаётся. */
export function TaskPanelNotFound({ closeHref }: { closeHref: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <TaskToolbar sticky start={<span className="text-sm text-muted-foreground">Задача</span>}>
        <TaskCloseLink href={closeHref} variant="panel" />
      </TaskToolbar>
      <div className="grid flex-1 place-content-center justify-items-center gap-3 p-6 text-center">
        <SectionHeading title="Задача не найдена" />
        <p className="max-w-xs text-sm text-muted-foreground">
          Возможно, её удалили или ссылка ведёт в другое пространство.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={closeHref} scroll={false}>
            Закрыть
          </Link>
        </Button>
      </div>
    </div>
  );
}
