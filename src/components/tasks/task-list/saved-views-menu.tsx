'use client';

import { BookmarkIcon, CheckIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { ConfirmActionDialog } from '@/components/forms/confirm-action-dialog';
import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  createSavedViewAction,
  deleteSavedViewAction,
  hasActiveFilters,
  renameSavedViewAction,
  SAVED_VIEW_NAME_MAX_LENGTH,
  SAVED_VIEWS_PER_SCOPE,
  serializeTaskListParams,
  type SavedTaskViewDto,
} from '@/modules/tasks/client';
import type { FormState } from '@/shared/types';

import { useTaskList } from './task-list-shell';
import type { SavedViewsOptions } from './task-list-types';

/**
 * Сохранённые фильтры списка: ссылки на `<список>?<параметры>`, сохранение текущего,
 * переименование и удаление. Фильтр отмечен, когда текущие параметры (без страницы) совпадают.
 */
export function SavedViewsMenu({ options }: { options: SavedViewsOptions }) {
  const { query, scope, basePath } = useTaskList();
  const [dialog, setDialog] = useState<'save' | 'manage' | null>(null);
  const current = serializeTaskListParams({ ...query, page: 1 }, scope);
  const active = options.views.find((view) => view.params === current);
  const canSave =
    hasActiveFilters(query) && options.views.length < SAVED_VIEWS_PER_SCOPE && !active;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('max-w-56', active && 'border-primary/50 bg-primary/5')}
          >
            <BookmarkIcon className="text-muted-foreground" />
            <span className="truncate">{active ? active.name : 'Фильтры'}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Сохранённые фильтры</DropdownMenuLabel>
          {options.views.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              Настройте фильтры и сохраните их, чтобы возвращаться одним кликом.
            </p>
          ) : (
            options.views.map((view) => (
              <DropdownMenuItem key={view.id} asChild>
                <Link
                  href={view.params ? `${basePath}?${view.params}` : basePath}
                  scroll={false}
                  aria-current={view === active ? 'true' : undefined}
                >
                  <CheckIcon className={cn(view === active ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{view.name}</span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canSave} onSelect={() => setDialog('save')}>
            Сохранить текущий…
          </DropdownMenuItem>
          {options.views.length > 0 && (
            <DropdownMenuItem onSelect={() => setDialog('manage')}>
              Переименовать или удалить…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveViewDialog
        open={dialog === 'save'}
        onOpenChange={(open) => setDialog(open ? 'save' : null)}
        options={options}
        params={current}
      />
      <ManageViewsDialog
        open={dialog === 'manage'}
        onOpenChange={(open) => setDialog(open ? 'manage' : null)}
        views={options.views}
      />
    </>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  options,
  params,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: SavedViewsOptions;
  params: string;
}) {
  const { scope } = useTaskList();
  const [state, formAction, pending] = useActionState<FormState<SavedTaskViewDto>, FormData>(
    async (prev, formData) => {
      const result = await createSavedViewAction(prev, formData);
      if (result?.ok) onOpenChange(false);
      return result;
    },
    null,
  );
  const failure = state && !state.ok ? state : null;
  const nameError = failure?.error.fieldErrors?.name?.join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Сохранить фильтр</DialogTitle>
            <DialogDescription>
              Текущие фильтры и сортировка появятся в меню «Фильтры». Их видите только вы.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="workspaceId" value={options.workspaceId ?? ''} />
          <input type="hidden" name="projectId" value={options.projectId ?? ''} />
          <input type="hidden" name="params" value={params} />
          <Input
            name="name"
            aria-label="Название фильтра"
            placeholder="Например, «Срочное на неделе»"
            required
            autoFocus
            maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
            defaultValue={failure?.values.name ?? ''}
            aria-invalid={nameError ? true : undefined}
          />
          <FormError message={nameError ?? failure?.error.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageViewsDialog({
  open,
  onOpenChange,
  views,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  views: SavedTaskViewDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Сохранённые фильтры</DialogTitle>
          <DialogDescription>Переименуйте или удалите фильтры этого списка.</DialogDescription>
        </DialogHeader>
        {views.length === 0 ? (
          <p className="text-sm text-muted-foreground">Сохранённых фильтров не осталось.</p>
        ) : (
          <ul className="grid divide-y">
            {views.map((view) => (
              <ViewRow key={`${view.id}:${view.name}`} view={view} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewRow({ view }: { view: SavedTaskViewDto }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    renameSavedViewAction,
    null,
  );
  const failure = state && !state.ok ? state : null;

  return (
    <li className="grid gap-1 py-3 first:pt-0 last:pb-0">
      {/* Диалог удаления — своя форма, поэтому он вне формы переименования. */}
      <div className="flex items-center gap-2">
        <form action={formAction} className="contents">
          <input type="hidden" name="viewId" value={view.id} />
          <Input
            name="name"
            aria-label={`Название фильтра «${view.name}»`}
            defaultValue={failure?.values.name ?? view.name}
            required
            maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
            aria-invalid={failure?.error.fieldErrors?.name ? true : undefined}
            className="h-8 min-w-0 flex-1"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </form>
        <ConfirmActionDialog
          action={deleteSavedViewAction}
          fields={{ viewId: view.id }}
          trigger={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Удалить фильтр «${view.name}»`}
              title="Удалить фильтр"
            >
              <Trash2Icon />
            </Button>
          }
          title={`Удалить фильтр «${view.name}»?`}
          description="Задачи не изменятся — пропадёт только сохранённая ссылка на список."
          confirmLabel="Удалить"
        />
      </div>
      <FormError message={failure?.error.fieldErrors?.name?.join(' ') ?? failure?.error.message} />
    </li>
  );
}
