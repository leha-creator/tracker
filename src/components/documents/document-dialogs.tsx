'use client';

import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { FormError, FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createFolderAction,
  DOCUMENT_TAGS_LIMIT,
  DOCUMENT_TITLE_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  moveDocumentAction,
  moveFolderAction,
  renameDocumentAction,
  renameFolderAction,
  setDocumentTagsAction,
  type DocumentFolderDto,
  type DocumentTagDto,
  type TagDto,
} from '@/modules/documents/client';
import type { FormState } from '@/shared/types';

import { folderOptions, ROOT_FOLDER_VALUE } from './folder-options';
import { TagBadge } from './tag-badge';

interface ControlledDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Закрывает диалог после успешного ответа action. Формы живут внутри `DialogContent`, который
 * размонтируется при закрытии, — при следующем открытии состояние action начинается заново.
 */
function useCloseOnSuccess(state: FormState<unknown>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (state?.ok) closeRef.current();
  }, [state]);
}

function DialogButtons({
  pending,
  label,
  pendingLabel,
  disabled,
  onCancel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Отмена
      </Button>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? pendingLabel : label}
      </Button>
    </DialogFooter>
  );
}

// ── Папка: создание и переименование ────────────────────────────────────────────

interface FolderNameProps {
  workspaceId: string;
  /** Создание: родитель новой папки (null — корень). */
  parentId?: string | null;
  /** Переименование: папка. */
  folder?: { id: string; name: string };
}

export function FolderNameDialog({
  open,
  onOpenChange,
  ...props
}: ControlledDialogProps & FolderNameProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.folder ? (
          <RenameFolderForm {...props} folder={props.folder} close={() => onOpenChange(false)} />
        ) : (
          <CreateFolderForm {...props} close={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const FOLDER_NAME_HINT =
  'Название уникально внутри родительской папки и не содержит символов / \\ : * ? " < > |';

function CreateFolderForm({
  workspaceId,
  parentId,
  close,
}: FolderNameProps & { close: () => void }) {
  const [state, formAction, pending] = useActionState<FormState<DocumentFolderDto>, FormData>(
    createFolderAction,
    null,
  );
  useCloseOnSuccess(state, close);
  const failure = state && !state.ok ? state : null;
  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Новая папка</DialogTitle>
        <DialogDescription>{FOLDER_NAME_HINT}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="parentId" value={parentId ?? ''} />
      <FormField
        name="name"
        label="Название"
        required
        autoFocus
        maxLength={FOLDER_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name ?? ''}
        errors={failure?.error.fieldErrors?.name}
      />
      {!failure?.error.fieldErrors?.name && <FormError message={failure?.error.message} />}
      <DialogButtons pending={pending} label="Создать" pendingLabel="Создание…" onCancel={close} />
    </form>
  );
}

function RenameFolderForm({
  workspaceId,
  folder,
  close,
}: FolderNameProps & { folder: { id: string; name: string }; close: () => void }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    renameFolderAction,
    null,
  );
  useCloseOnSuccess(state, close);
  const failure = state && !state.ok ? state : null;
  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Переименовать папку</DialogTitle>
        <DialogDescription>{FOLDER_NAME_HINT}</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="folderId" value={folder.id} />
      <FormField
        name="name"
        label="Название"
        required
        autoFocus
        maxLength={FOLDER_NAME_MAX_LENGTH}
        defaultValue={failure?.values.name ?? folder.name}
        errors={failure?.error.fieldErrors?.name}
      />
      {!failure?.error.fieldErrors?.name && <FormError message={failure?.error.message} />}
      <DialogButtons
        pending={pending}
        label="Сохранить"
        pendingLabel="Сохранение…"
        onCancel={close}
      />
    </form>
  );
}

// ── Документ: переименование ────────────────────────────────────────────────────

interface RenameDocumentProps {
  workspaceId: string;
  document: { id: string; title: string };
}

export function RenameDocumentDialog({
  open,
  onOpenChange,
  ...props
}: ControlledDialogProps & RenameDocumentProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <RenameDocumentForm {...props} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RenameDocumentForm({
  workspaceId,
  document,
  close,
}: RenameDocumentProps & { close: () => void }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    renameDocumentAction,
    null,
  );
  useCloseOnSuccess(state, close);
  const failure = state && !state.ok ? state : null;
  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Переименовать документ</DialogTitle>
        <DialogDescription>У файла изменится и имя при скачивании.</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="documentId" value={document.id} />
      <FormField
        name="title"
        label="Название"
        required
        autoFocus
        maxLength={DOCUMENT_TITLE_MAX_LENGTH}
        defaultValue={failure?.values.title ?? document.title}
        errors={failure?.error.fieldErrors?.title}
      />
      {!failure?.error.fieldErrors?.title && <FormError message={failure?.error.message} />}
      <DialogButtons
        pending={pending}
        label="Сохранить"
        pendingLabel="Сохранение…"
        onCancel={close}
      />
    </form>
  );
}

// ── Перенос папки или документа ─────────────────────────────────────────────────

export type MoveTarget =
  | { type: 'folder'; id: string; name: string; parentId: string | null }
  | { type: 'document'; id: string; name: string; folderId: string | null };

interface MoveProps {
  workspaceId: string;
  folders: DocumentFolderDto[];
  target: MoveTarget;
}

export function MoveDialog({ open, onOpenChange, ...props }: ControlledDialogProps & MoveProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <MoveForm {...props} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Назначение — любая папка, кроме перемещаемой и её подпапок. */
function MoveForm({ workspaceId, folders, target, close }: MoveProps & { close: () => void }) {
  const isFolder = target.type === 'folder';
  const current = (isFolder ? target.parentId : target.folderId) ?? ROOT_FOLDER_VALUE;
  const [destination, setDestination] = useState(current);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isFolder ? moveFolderAction : moveDocumentAction,
    null,
  );
  useCloseOnSuccess(state, close);
  const failure = state && !state.ok ? state : null;
  const selectId = useId();
  const options = folderOptions(folders, isFolder ? target.id : undefined);

  return (
    <form action={formAction} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{isFolder ? 'Переместить папку' : 'Переместить документ'}</DialogTitle>
        <DialogDescription>«{target.name}»</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name={isFolder ? 'folderId' : 'documentId'} value={target.id} />
      <input type="hidden" name={isFolder ? 'targetId' : 'folderId'} value={destination} />
      <div className="grid gap-2">
        <Label htmlFor={selectId}>Папка назначения</Label>
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                <span style={{ paddingLeft: `${Math.max(0, option.depth - 1) * 0.75}rem` }}>
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormError message={failure?.error.message} />
      <DialogButtons
        pending={pending}
        label="Переместить"
        pendingLabel="Перемещение…"
        disabled={destination === current}
        onCancel={close}
      />
    </form>
  );
}

// ── Теги документа ──────────────────────────────────────────────────────────────

interface DocumentTagsProps {
  workspaceId: string;
  documentId: string;
  tags: TagDto[];
  selected: DocumentTagDto[];
}

export function DocumentTagsDialog({
  open,
  onOpenChange,
  ...props
}: ControlledDialogProps & DocumentTagsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DocumentTagsForm {...props} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DocumentTagsForm({
  workspaceId,
  documentId,
  tags,
  selected,
  close,
}: DocumentTagsProps & { close: () => void }) {
  const [checked, setChecked] = useState(() => new Set(selected.map((tag) => tag.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const overLimit = checked.size > DOCUMENT_TAGS_LIMIT;

  function toggle(id: string, value: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setDocumentTagsAction({ workspaceId, documentId, tagIds: [...checked] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success('Теги сохранены');
      close();
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>Теги документа</DialogTitle>
        <DialogDescription>
          Не больше {DOCUMENT_TAGS_LIMIT}. Новые теги создаются в «Управлении тегами».
        </DialogDescription>
      </DialogHeader>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">В пространстве пока нет тегов.</p>
      ) : (
        <ul className="grid max-h-72 gap-1 overflow-y-auto">
          {tags.map((tag) => {
            const id = `tag-${tag.id}`;
            return (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
              >
                <Checkbox
                  id={id}
                  checked={checked.has(tag.id)}
                  onCheckedChange={(value) => toggle(tag.id, value === true)}
                />
                <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                  <TagBadge name={tag.name} color={tag.color} />
                </Label>
              </li>
            );
          })}
        </ul>
      )}
      {overLimit && (
        <p className="text-sm text-destructive">Выбрано больше {DOCUMENT_TAGS_LIMIT} тегов</p>
      )}
      <FormError message={error ?? undefined} />
      <DialogButtons
        pending={pending}
        label="Сохранить"
        pendingLabel="Сохранение…"
        disabled={overLimit}
        onCancel={close}
      />
    </form>
  );
}
