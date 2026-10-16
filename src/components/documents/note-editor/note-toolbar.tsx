'use client';

import {
  BoldIcon,
  CodeIcon,
  FileCodeIcon,
  Heading2Icon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { MarkdownAction } from '@/modules/documents/client';

interface ToolbarItem {
  action: MarkdownAction;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

const GROUPS: ToolbarItem[][] = [
  [
    { action: 'heading', label: 'Заголовок', icon: Heading2Icon },
    { action: 'bold', label: 'Жирный', icon: BoldIcon, shortcut: 'Ctrl+B' },
    { action: 'italic', label: 'Курсив', icon: ItalicIcon, shortcut: 'Ctrl+I' },
    { action: 'strike', label: 'Зачёркнутый', icon: StrikethroughIcon },
  ],
  [
    { action: 'bulletList', label: 'Список', icon: ListIcon },
    { action: 'orderedList', label: 'Нумерованный список', icon: ListOrderedIcon },
    { action: 'checklist', label: 'Чек-лист', icon: ListChecksIcon },
    { action: 'quote', label: 'Цитата', icon: QuoteIcon },
  ],
  [
    { action: 'code', label: 'Код в строке', icon: CodeIcon },
    { action: 'codeBlock', label: 'Блок кода', icon: FileCodeIcon },
    { action: 'link', label: 'Ссылка', icon: LinkIcon, shortcut: 'Ctrl+K' },
    { action: 'table', label: 'Таблица', icon: TableIcon },
  ],
];

/** Панель форматирования Markdown. `extra` — дополнительные кнопки (ссылка на документ). */
export function NoteToolbar({
  onAction,
  extra,
}: {
  onAction: (action: MarkdownAction) => void;
  extra?: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <div role="toolbar" aria-label="Форматирование" className="flex flex-wrap items-center gap-1">
        {GROUPS.map((group, index) => (
          <div key={index} className="flex items-center gap-0.5 border-r pr-1 last:border-r-0">
            {group.map(({ action, label, icon: Icon, shortcut }) => (
              <Tooltip key={action}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={shortcut ? `${label} (${shortcut})` : label}
                    // Не забираем фокус у текстового поля: выделение остаётся на месте.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onAction(action)}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{shortcut ? `${label} · ${shortcut}` : label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
        {extra}
      </div>
    </TooltipProvider>
  );
}
