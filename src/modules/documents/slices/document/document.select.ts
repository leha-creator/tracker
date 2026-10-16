import type { Prisma } from '@/generated/prisma/client';

/** Документы, видимые в списках: заметки и подтверждённые файлы. */
export const VISIBLE_DOCUMENT_WHERE = {
  OR: [{ kind: 'note' as const }, { status: 'ready' as const }],
};

const USER_SELECT = { select: { id: true, name: true, image: true, isAgent: true } } as const;

/** Поля документа для списков (без текста заметки). */
export const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  workspaceId: true,
  folderId: true,
  kind: true,
  title: true,
  extension: true,
  contentType: true,
  size: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: USER_SELECT,
  updatedBy: USER_SELECT,
  tags: {
    select: { tag: { select: { id: true, name: true, nameKey: true, color: true } } },
  },
} as const;

/** Полный документ для страницы просмотра и редактора. */
export const DOCUMENT_SELECT = {
  ...DOCUMENT_SUMMARY_SELECT,
  content: true,
  version: true,
  fileName: true,
  storageKey: true,
  workspace: { select: { slug: true } },
  // Пометка «через агента»: автор-человек и токен MCP, через который создан документ.
  createdViaToken: { select: { name: true } },
} as const;

export type DocumentSummaryRow = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_SUMMARY_SELECT;
}>;
export type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;
