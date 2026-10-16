import {
  FileArchiveIcon,
  FileAudioIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  FileVideoIcon,
  NotebookTextIcon,
  PresentationIcon,
  type LucideIcon,
} from 'lucide-react';

import type { DocumentFileKind, DocumentKind } from '@/modules/documents/client';

const FILE_ICONS: Record<DocumentFileKind, LucideIcon> = {
  image: FileImageIcon,
  pdf: FileTypeIcon,
  text: FileCodeIcon,
  audio: FileAudioIcon,
  video: FileVideoIcon,
  document: FileTextIcon,
  spreadsheet: FileSpreadsheetIcon,
  presentation: PresentationIcon,
  archive: FileArchiveIcon,
};

const FILE_KIND_LABELS: Record<DocumentFileKind, string> = {
  image: 'Изображение',
  pdf: 'PDF',
  text: 'Текстовый файл',
  audio: 'Аудио',
  video: 'Видео',
  document: 'Документ',
  spreadsheet: 'Таблица',
  presentation: 'Презентация',
  archive: 'Архив',
};

/** Подпись вида документа: «Заметка», «PDF», «Изображение»… */
export function documentKindLabel(kind: DocumentKind, fileKind: DocumentFileKind | null): string {
  if (kind === 'note') return 'Заметка';
  return fileKind ? FILE_KIND_LABELS[fileKind] : 'Файл';
}

export function DocumentIcon({
  kind,
  fileKind,
  className,
}: {
  kind: DocumentKind;
  fileKind: DocumentFileKind | null;
  className?: string;
}) {
  const Icon = kind === 'note' ? NotebookTextIcon : fileKind ? FILE_ICONS[fileKind] : FileIcon;
  return <Icon className={className} aria-hidden />;
}
