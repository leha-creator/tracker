'use client';

import { Trash2Icon } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StatusDot } from '@/components/projects/status-badge';
import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  createTagAction,
  deleteTagAction,
  DOCUMENT_TAG_COLORS,
  TAG_NAME_MAX_LENGTH,
  updateTagAction,
  type DocumentTagColor,
  type TagDto,
} from '@/modules/documents/client';
import type { FormState } from '@/shared/types';

const COLOR_LABELS: Record<DocumentTagColor, string> = {
  gray: 'Серый',
  blue: 'Синий',
  green: 'Зелёный',
  amber: 'Жёлтый',
  red: 'Красный',
  violet: 'Фиолетовый',
};

function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: DocumentTagColor;
  onChange: (color: DocumentTagColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Цвет тега" className="flex gap-1">
      <input type="hidden" name={name} value={value} />
      {DOCUMENT_TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={COLOR_LABELS[color]}
          onClick={() => onChange(color)}
          className={cn(
            'grid size-7 place-items-center rounded-md border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === color ? 'border-foreground' : 'border-transparent hover:border-border',
          )}
        >
          <StatusDot color={color} className="size-3" />
        </button>
      ))}
    </div>
  );
}

function CreateTagForm({ workspaceId }: { workspaceId: string }) {
  const [color, setColor] = useState<DocumentTagColor>('gray');
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<FormState<TagDto>, FormData>(
    async (prev, formData) => {
      const result = await createTagAction(prev, formData);
      // Успех — очищаем поле (новый key пересоздаёт форму).
      if (result?.ok) setFormKey((key) => key + 1);
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  return (
    <form key={formKey} action={formAction} className="grid gap-2 border-t pt-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          aria-label="Название нового тега"
          placeholder="Новый тег"
          required
          maxLength={TAG_NAME_MAX_LENGTH}
          defaultValue={failure?.values.name ?? ''}
          aria-invalid={failure?.error.fieldErrors?.name ? true : undefined}
          className="h-8 min-w-40 flex-1"
        />
        <ColorPicker name="color" value={color} onChange={setColor} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Создание…' : 'Добавить'}
        </Button>
      </div>
      <FormError message={failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message} />
    </form>
  );
}

function TagRow({ workspaceId, tag }: { workspaceId: string; tag: TagDto }) {
  const [color, setColor] = useState(tag.color);
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateTagAction, null);
  const [deleting, startDelete] = useTransition();
  const failure = state && !state.ok ? state : null;

  function remove() {
    startDelete(async () => {
      const result = await deleteTagAction({ workspaceId, tagId: tag.id });
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`Тег «${tag.name}» удалён`);
    });
  }

  return (
    <li className="grid gap-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="tagId" value={tag.id} />
        <Input
          name="name"
          aria-label={`Название тега «${tag.name}»`}
          defaultValue={failure?.values.name ?? tag.name}
          required
          maxLength={TAG_NAME_MAX_LENGTH}
          className="h-8 min-w-36 flex-1"
        />
        <ColorPicker name="color" value={color} onChange={setColor} />
        <span
          className="w-10 text-right text-xs text-muted-foreground tabular-nums"
          title="Документов с тегом"
        >
          {tag.documentsCount}
        </span>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? '…' : 'Сохранить'}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={remove}
          disabled={deleting}
          aria-label={`Удалить тег «${tag.name}»`}
          title="Удалить тег (снимется со всех документов)"
        >
          <Trash2Icon />
        </Button>
      </form>
      <FormError message={failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message} />
    </li>
  );
}

/** Справочник тегов пространства: создание, переименование, цвет, удаление. */
export function TagManagerDialog({
  workspaceId,
  tags,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  tags: TagDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Теги документов</DialogTitle>
          <DialogDescription>
            Теги общие для пространства. Удаление тега снимает его со всех документов.
          </DialogDescription>
        </DialogHeader>
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Тегов пока нет — добавьте первый.</p>
        ) : (
          <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
            {tags.map((tag) => (
              <TagRow
                key={`${tag.id}:${tag.name}:${tag.color}`}
                workspaceId={workspaceId}
                tag={tag}
              />
            ))}
          </ul>
        )}
        <CreateTagForm workspaceId={workspaceId} />
      </DialogContent>
    </Dialog>
  );
}
