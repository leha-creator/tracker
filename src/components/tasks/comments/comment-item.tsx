'use client';

import { useActionState, useState } from 'react';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/workspaces/confirm-action-dialog';
import {
  deleteCommentAction,
  updateCommentAction,
  type TaskCommentDto,
} from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { AssigneeAvatar } from '../assignee-avatar';
import { CommentBodyField } from './comment-body-field';

/** Дата, отформатированная на сервере: часовой пояс браузера не влияет на гидратацию. */
export interface CommentDateLabel {
  iso: string;
  label: string;
}

export interface CommentItemProps {
  workspaceId: string;
  taskId: string;
  comment: Omit<TaskCommentDto, 'createdAt' | 'editedAt'>;
  createdAt: CommentDateLabel;
  editedAt: CommentDateLabel | null;
}

interface CommentEditFormProps {
  ids: Record<string, string>;
  body: string;
  onDone: () => void;
}

function CommentEditForm({ ids, body, onDone }: CommentEditFormProps) {
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

/** Комментарий: автор, дата, текст; редактирование — автору, удаление — автору и владельцу. */
export function CommentItem({
  workspaceId,
  taskId,
  comment,
  createdAt,
  editedAt,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const ids = { workspaceId, taskId, commentId: comment.id };
  const authorName = comment.author?.name ?? 'Удалённый пользователь';

  return (
    <li className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {comment.author && (
          <span aria-hidden>
            <AssigneeAvatar user={comment.author} />
          </span>
        )}
        <span className="font-medium">{authorName}</span>
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
        <CommentEditForm ids={ids} body={comment.body} onDone={() => setEditing(false)} />
      ) : (
        <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      )}
    </li>
  );
}
