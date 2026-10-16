'use client';

import { useActionState, useState, type ReactNode } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/users/user-avatar';
import { UserHoverCard } from '@/components/users/user-hover-card';
import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import {
  deleteCommentAction,
  updateCommentAction,
  type MentionCandidate,
  type MentionRange,
  type TaskCommentDto,
} from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { AttachmentItem } from '../attachments/attachment-item';
import { CommentBodyField } from './comment-body-field';

/** Дата, отформатированная на сервере: часовой пояс браузера не влияет на гидратацию. */
export interface CommentDateLabel {
  iso: string;
  label: string;
}

export interface CommentItemProps {
  workspaceId: string;
  taskId: string;
  comment: Omit<TaskCommentDto, 'createdAt' | 'editedAt' | 'attachments'> & {
    attachments: Omit<TaskCommentDto['attachments'][number], 'createdAt'>[];
  };
  createdAt: CommentDateLabel;
  editedAt: CommentDateLabel | null;
  /** Участники пространства: подсказка `@` при правке и карточки упомянутых. */
  members: readonly MentionCandidate[];
}

interface CommentEditFormProps {
  ids: Record<string, string>;
  body: string;
  members: readonly MentionCandidate[];
  onDone: () => void;
}

function CommentEditForm({ ids, body, members, onDone }: CommentEditFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await updateCommentAction(prev, formData);
      if (result?.ok) onDone();
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const fieldErrors = failure?.error.fieldErrors;

  return (
    <form action={formAction} className="grid gap-2" noValidate>
      {Object.entries(ids).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <FormError message={fieldErrors ? undefined : failure?.error.message} />
      <CommentBodyField
        id={`comment-${ids.commentId}-body`}
        label="Текст комментария"
        defaultValue={failure?.values.body ?? body}
        errors={fieldErrors?.body}
        autoFocus
        onEscape={onDone}
        members={members}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

/**
 * Текст комментария с выделенными @упоминаниями: упоминание — карточка участника при наведении.
 * Остальное — простой текст (переводы строк сохраняет `white-space: pre-wrap`).
 */
function CommentBody({
  body,
  mentions,
  members,
}: {
  body: string;
  mentions: readonly MentionRange[];
  members: readonly MentionCandidate[];
}) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.start < cursor) continue;
    parts.push(body.slice(cursor, mention.start));
    const text = body.slice(mention.start, mention.end);
    const member = members.find((item) => item.userId === mention.userId);
    parts.push(
      <UserHoverCard
        key={mention.start}
        user={{ userId: mention.userId, name: member?.name ?? text.slice(1), image: member?.image }}
        className="rounded-sm bg-primary/10 px-0.5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {text}
      </UserHoverCard>,
    );
    cursor = mention.end;
  }
  parts.push(body.slice(cursor));
  return <p className="text-sm break-words whitespace-pre-wrap">{parts}</p>;
}

/** Комментарий: автор, дата, текст; редактирование — автору, удаление — автору и владельцу. */
export function CommentItem({
  workspaceId,
  taskId,
  comment,
  createdAt,
  editedAt,
  members,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const ids = { workspaceId, taskId, commentId: comment.id };
  const authorName = comment.author?.name ?? 'Удалённый пользователь';

  return (
    // id — якорь ссылки из уведомления (`#comment-<id>`).
    <li
      id={`comment-${comment.id}`}
      className="grid scroll-mt-20 gap-2 rounded-lg border p-3 target:ring-2 target:ring-primary/40"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {comment.author ? (
          <UserHoverCard
            user={comment.author}
            className="flex items-center gap-2 rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <UserAvatar user={comment.author} />
            {authorName}
          </UserHoverCard>
        ) : (
          <span className="font-medium">{authorName}</span>
        )}
        <time dateTime={createdAt.iso} className="text-xs text-muted-foreground">
          {createdAt.label}
        </time>
        {editedAt && (
          <span className="text-xs text-muted-foreground" title={`Изменён ${editedAt.label}`}>
            (изменён)
          </span>
        )}
        {!editing && (comment.canEdit || comment.canDelete) && (
          <div className="ml-auto flex gap-1">
            {comment.canEdit && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Изменить
              </Button>
            )}
            {comment.canDelete && (
              <ConfirmActionDialog
                action={deleteCommentAction}
                fields={ids}
                trigger={
                  <Button type="button" size="sm" variant="ghost">
                    Удалить
                  </Button>
                }
                title="Удалить комментарий?"
                description="Комментарий исчезнет для всех участников. Действие нельзя отменить."
                confirmLabel="Удалить"
              />
            )}
          </div>
        )}
      </div>
      {editing ? (
        <CommentEditForm
          ids={ids}
          body={comment.body}
          members={members}
          onDone={() => setEditing(false)}
        />
      ) : (
        comment.body && (
          <CommentBody body={comment.body} mentions={comment.mentions} members={members} />
        )
      )}
      {comment.attachments.length > 0 && (
        <ul className="grid gap-2 @lg:grid-cols-2" aria-label="Файлы комментария">
          {comment.attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              workspaceId={workspaceId}
              taskId={taskId}
              attachment={attachment}
              // Удаление отдельных файлов — в режиме правки, чтобы не путать с удалением комментария.
              deletable={editing}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
