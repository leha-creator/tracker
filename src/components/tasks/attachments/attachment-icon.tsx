import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from 'lucide-react';

import type { AttachmentKind } from '@/modules/tasks/client';

const ICONS: Record<AttachmentKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  text: FileText,
  archive: FileArchive,
};

/** Иконка по категории файла; без категории (загрузка ещё идёт) — общая. */
export function AttachmentIcon({ kind, className }: { kind?: AttachmentKind; className?: string }) {
  const Icon = kind ? ICONS[kind] : File;
  return <Icon aria-hidden className={className} />;
}
