import type { DocumentViewer } from '@/modules/documents/client';

/** Что показать на странице документа. */
export type ViewerChoice =
  | { kind: 'note' }
  | { kind: 'inline'; viewer: 'image' | 'pdf' | 'audio' | 'video' }
  | { kind: 'text'; viewer: 'markdown' | 'csv' | 'tsv' | 'json' | 'code' }
  | { kind: 'fallback' };

/**
 * Просмотрщик по виду документа и его типу. Файл без просмотра (офисные форматы, архивы, SVG)
 * и тип, который сервер не отдаёт inline, — карточка со скачиванием.
 */
export function pickViewer(document: {
  kind: 'note' | 'file';
  viewer: DocumentViewer | null;
  inlineViewable: boolean;
}): ViewerChoice {
  if (document.kind === 'note') return { kind: 'note' };
  switch (document.viewer) {
    case 'image':
    case 'pdf':
    case 'audio':
    case 'video':
      return document.inlineViewable
        ? { kind: 'inline', viewer: document.viewer }
        : { kind: 'fallback' };
    case 'markdown':
    case 'csv':
    case 'tsv':
    case 'json':
    case 'code':
      return { kind: 'text', viewer: document.viewer };
    case null:
      return { kind: 'fallback' };
  }
}

/** JSON с отступами; невалидный — как есть (показывается текстом). */
export function prettyJson(text: string): { text: string; valid: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), valid: true };
  } catch {
    return { text, valid: false };
  }
}
