import Link from 'next/link';

import type { TaskCommentsDto } from '@/modules/tasks';

import { CommentItem, type CommentDateLabel } from './comment-item';

const DATE_TIME = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' });

function dateLabel(date: Date): CommentDateLabel {
  return { iso: date.toISOString(), label: DATE_TIME.format(date) };
}

interface CommentListProps {
  workspaceId: string;
  taskId: string;
  comments: TaskCommentsDto;
  /** Адрес «Показать все» — текущая страница или панель с `comments=all`. */
  showAllHref: string;
}

/** Лента комментариев (от старых к новым). Даты форматируются здесь, на сервере. */
export function CommentList({ workspaceId, taskId, comments, showAllHref }: CommentListProps) {
  if (comments.total === 0) {
    return <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>;
  }
  return (
    <div className="grid gap-3">
      {comments.truncated && (
        <p className="text-sm text-muted-foreground">
          Показаны последние {comments.items.length} из {comments.total}.{' '}
          <Link href={showAllHref} scroll={false} className="underline">
            Показать все ({comments.total})
          </Link>
        </p>
      )}
      <ol className="grid gap-3">
        {comments.items.map(({ createdAt, editedAt, attachments, ...comment }) => (
          <CommentItem
            key={comment.id}
            workspaceId={workspaceId}
            taskId={taskId}
            // Даты файлов в ленте не показываются: Date в клиентский компонент не передаём.
            comment={{
              ...comment,
              attachments: attachments.map(({ createdAt: _, ...file }) => file),
            }}
            createdAt={dateLabel(createdAt)}
            editedAt={editedAt ? dateLabel(editedAt) : null}
          />
        ))}
      </ol>
    </div>
  );
}
