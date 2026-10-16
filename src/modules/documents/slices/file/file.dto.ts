/** Слот загрузки: форма presigned POST для отправки файла прямо в хранилище. */
export interface DocumentUploadDto {
  documentId: string;
  url: string;
  fields: Record<string, string>;
}

/** Ответ `GET /api/documents/[id]/file`: редирект на хранилище или текст заметки. */
export type DocumentFileResponse =
  { kind: 'redirect'; url: string } | { kind: 'note'; content: string; contentDisposition: string };

export interface DocumentTextDto {
  text: string;
  /** Файл длиннее показанного начала. */
  truncated: boolean;
}

export interface StorageUsageDto {
  usedBytes: number;
  quotaBytes: number;
  filesCount: number;
}
