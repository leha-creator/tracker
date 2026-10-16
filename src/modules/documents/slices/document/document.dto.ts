import type { DocumentFileKind, DocumentTagColor, DocumentViewer } from '../../models';

export type DocumentKind = 'note' | 'file';

export interface DocumentUserDto {
  userId: string;
  name: string;
  image: string | null;
}

export interface DocumentTagDto {
  id: string;
  name: string;
  color: DocumentTagColor;
}

/** Документ в списках: без текста заметки. */
export interface DocumentSummaryDto {
  id: string;
  kind: DocumentKind;
  title: string;
  folderId: string | null;
  /** Поля файла; у заметки — null. */
  extension: string | null;
  fileKind: DocumentFileKind | null;
  viewer: DocumentViewer | null;
  size: number | null;
  tags: DocumentTagDto[];
  createdBy: DocumentUserDto | null;
  updatedBy: DocumentUserDto | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Документ для страницы просмотра и редактора. */
export interface DocumentDto extends DocumentSummaryDto {
  workspaceId: string;
  workspaceSlug: string;
  /** Версия заметки для сохранения без перезаписи чужих правок. */
  version: number;
  /** Markdown заметки; у файла — null. */
  content: string | null;
  /** Имя файла для скачивания; у заметки — null. */
  fileName: string | null;
  /** Файл можно открыть по ссылке `inline` (картинка, PDF, медиа). */
  inlineViewable: boolean;
  /** Создан агентом по личному токену автора; null — вручную или самим агентом. */
  createdVia: { tokenName: string } | null;
}

export interface NoteSavedDto {
  version: number;
  updatedAt: Date;
}
