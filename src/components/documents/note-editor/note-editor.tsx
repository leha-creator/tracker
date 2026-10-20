'use client';

import { CopyIcon, RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  applyMarkdownFormat,
  createNoteAction,
  DOCUMENT_TITLE_MAX_LENGTH,
  insertMarkdownLink,
  NOTE_CONTENT_MAX_LENGTH,
  updateNoteAction,
  type DocumentFolderDto,
  type FormatResult,
  type MarkdownAction,
} from '@/modules/documents/client';
import type { FormState } from '@/shared/types';

import { documentHref, folderHref } from '../docs-href';
import { folderOptions, ROOT_FOLDER_VALUE } from '../folder-options';
import { MarkdownView } from '../markdown/markdown-view';
import { DocumentLinkPicker } from './document-link-picker';
import { NoteToolbar } from './note-toolbar';

type View = 'write' | 'preview' | 'split';

interface NoteEditorProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Новая заметка — `create` (папка выбирается), правка — `edit` с id и версией. */
  mode: 'create' | 'edit';
  documentId?: string;
  version?: number;
  initialTitle: string;
  initialContent: string;
  folderId: string | null;
  folders: DocumentFolderDto[];
  /** Привязать новую заметку к задаче (создание из задачи). */
  linkTaskId?: string;
}

/** По физической клавише (event.code): в русской раскладке event.key — «и», «ш», «л». */
const SHORTCUTS: Record<string, MarkdownAction> = { KeyB: 'bold', KeyI: 'italic', KeyK: 'link' };

/**
 * Редактор Markdown-заметки: поле с панелью форматирования, вкладки «Редактор / Просмотр /
 * Рядом», сохранение кнопкой и Ctrl+S. Правка защищена версией: если заметку успели изменить,
 * сохранение отклоняется и предлагается перезагрузить.
 */
export function NoteEditor(props: NoteEditorProps) {
  const { workspaceId, workspaceSlug, mode, folders } = props;
  const [title, setTitle] = useState(props.initialTitle);
  const [content, setContent] = useState(props.initialContent);
  const [folderId, setFolderId] = useState(props.folderId ?? ROOT_FOLDER_VALUE);
  const [view, setView] = useState<View>('write');
  const [version, setVersion] = useState(props.version ?? 1);
  const [saved, setSaved] = useState({ title: props.initialTitle, content: props.initialContent });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, startSaving] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const ids = { title: useId(), folder: useId(), content: useId() };

  const [createState, createAction, creating] = useActionState<FormState, FormData>(
    createNoteAction,
    null,
  );
  const createFailure = createState && !createState.ok ? createState : null;
  // Создание не удалось — уход со страницы снова предупреждает о несохранённом тексте.
  useEffect(() => {
    if (createFailure) submittingRef.current = false;
  }, [createFailure]);

  const dirty = title !== saved.title || content !== saved.content;
  const tooLong = content.length > NOTE_CONTENT_MAX_LENGTH;

  // Несохранённые изменения — предупреждение при закрытии вкладки. Скрытая (Activity) страница
  // снимает эффект, поэтому чужие страницы предупреждение не наследуют.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!submittingRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function applyResult(result: FormatResult) {
    setContent(result.text);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(result.selection.start, result.selection.end);
    });
  }

  function currentSelection() {
    const textarea = textareaRef.current;
    return textarea
      ? { start: textarea.selectionStart, end: textarea.selectionEnd }
      : { start: content.length, end: content.length };
  }

  function format(action: MarkdownAction) {
    if (view === 'preview') setView('write');
    applyResult(applyMarkdownFormat(content, currentSelection(), action));
  }

  function save() {
    if (mode === 'create') {
      formRef.current?.requestSubmit();
      return;
    }
    if (!props.documentId || saving || tooLong) return;
    setSaveError(null);
    const documentId = props.documentId;
    startSaving(async () => {
      const result = await updateNoteAction({ workspaceId, documentId, title, content, version });
      if (result.ok) {
        setVersion(result.data.version);
        setSaved({ title, content });
        toast.success('Сохранено');
        return;
      }
      if (result.error.code === 'CONFLICT') setConflict(true);
      else setSaveError(result.error.fieldErrors?.title?.join(' ') ?? result.error.message);
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.code === 'KeyS') {
      event.preventDefault();
      save();
      return;
    }
    const action = SHORTCUTS[event.code];
    if (action && event.target === textareaRef.current) {
      event.preventDefault();
      format(action);
    }
  }

  async function copyMyText() {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Ваш текст скопирован');
    } catch {
      toast.error('Не удалось скопировать — выделите текст вручную');
    }
  }

  const titleError = createFailure?.error.fieldErrors?.title?.join(' ');
  const contentError = createFailure?.error.fieldErrors?.content?.join(' ');
  const cancelHref =
    mode === 'edit' && props.documentId
      ? documentHref(workspaceSlug, props.documentId)
      : folderHref(workspaceSlug, props.folderId);

  const editor = (
    <div className="grid min-w-0 content-start gap-2">
      <Label htmlFor={ids.content} className="sr-only">
        Текст заметки (Markdown)
      </Label>
      <Textarea
        ref={textareaRef}
        id={ids.content}
        name="content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={
          '# Заголовок\n\nТекст заметки в Markdown: **жирный**, _курсив_, списки, таблицы…'
        }
        spellCheck
        aria-invalid={tooLong || Boolean(contentError) || undefined}
        className="min-h-[60dvh] resize-y font-mono text-sm leading-6"
      />
    </div>
  );
  const preview = (
    <div
      className="min-h-[60dvh] min-w-0 rounded-md border bg-card px-5 py-4"
      aria-label="Предпросмотр"
    >
      {content.trim() ? (
        <MarkdownView source={content} />
      ) : (
        <p className="text-sm text-muted-foreground">Нечего показать — начните писать.</p>
      )}
    </div>
  );

  return (
    <form
      ref={formRef}
      action={createAction}
      onSubmit={(event) => {
        if (mode === 'edit') {
          event.preventDefault();
          save();
          return;
        }
        // Создание завершится переходом на заметку — это не «уход с несохранёнными правками».
        submittingRef.current = true;
      }}
      onKeyDown={onKeyDown}
      className="grid gap-4"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {mode === 'create' && (
        <>
          <input type="hidden" name="folderId" value={folderId} />
          {props.linkTaskId && <input type="hidden" name="linkTaskId" value={props.linkTaskId} />}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={ids.title}>Название</Label>
          <Input
            id={ids.title}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            autoFocus={mode === 'create'}
            aria-invalid={titleError ? true : undefined}
            className="text-base font-medium"
          />
          {titleError && <p className="text-sm text-destructive">{titleError}</p>}
        </div>
        {mode === 'create' && (
          <div className="grid gap-2 sm:w-64">
            <Label htmlFor={ids.folder}>Папка</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger id={ids.folder} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {folderOptions(folders).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span style={{ paddingLeft: `${Math.max(0, option.depth - 1) * 0.75}rem` }}>
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-1">
        <NoteToolbar
          onAction={format}
          extra={
            <DocumentLinkPicker
              workspaceId={workspaceId}
              onPick={(document) => {
                if (view === 'preview') setView('write');
                applyResult(
                  insertMarkdownLink(content, currentSelection(), {
                    href: documentHref(workspaceSlug, document.id),
                    label: document.title,
                  }),
                );
              }}
            />
          }
        />
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value="write">Редактор</TabsTrigger>
            <TabsTrigger value="preview">Просмотр</TabsTrigger>
            <TabsTrigger value="split" className="hidden lg:inline-flex">
              Рядом
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {conflict && (
        <div
          role="alert"
          className="grid gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <p>
            <strong>Заметку изменили, пока вы её редактировали.</strong> Сохранение перезаписало бы
            чужие правки. Скопируйте свой текст и загрузите актуальную версию.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void copyMyText()}>
              <CopyIcon aria-hidden />
              Скопировать мой текст
            </Button>
            <Button type="button" size="sm" onClick={() => window.location.reload()}>
              <RotateCcwIcon aria-hidden />
              Загрузить актуальную версию
            </Button>
          </div>
        </div>
      )}

      {/* Скрытая область тоже отправляется с формой: textarea остаётся в DOM. */}
      <div className={cn('grid gap-4', view === 'split' && 'lg:grid-cols-2')}>
        <div className={cn(view === 'preview' && 'hidden')}>{editor}</div>
        {view !== 'write' && preview}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            'text-xs tabular-nums',
            tooLong ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {content.length.toLocaleString('ru')} / {NOTE_CONTENT_MAX_LENGTH.toLocaleString('ru')}
          {mode === 'edit' && (dirty ? ' · есть несохранённые изменения' : ' · сохранено')}
        </p>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline">
            <Link href={cancelHref}>{mode === 'edit' ? 'К просмотру' : 'Отмена'}</Link>
          </Button>
          <Button
            type="submit"
            disabled={tooLong || saving || creating || conflict || (mode === 'edit' && !dirty)}
          >
            {saving || creating ? 'Сохранение…' : mode === 'create' ? 'Создать' : 'Сохранить'}
          </Button>
        </div>
      </div>
      <FormError
        message={
          saveError ?? (titleError || contentError ? undefined : createFailure?.error.message)
        }
      />
      {contentError && <p className="text-sm text-destructive">{contentError}</p>}
    </form>
  );
}
