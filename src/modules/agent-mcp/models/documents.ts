import {
  folderPath,
  formatBytes,
  formatFolderPath,
  type DocumentDto,
  type DocumentFolderDto,
  type DocumentListPageDto,
  type LinkedDocumentDto,
  type LinkedTaskDto,
  type TagDto,
} from '@/modules/documents/client';

import { pickByIdOrName } from './catalog';

/** Сколько текста документа отдаём агенту за один вызов get_document. */
export const MCP_DOCUMENT_TEXT_MAX_BYTES = 100 * 1024;

/**
 * Обрезает текст до `maxBytes` байт UTF-8, не разрывая символ. `truncated` — текст был длиннее.
 */
export function truncateUtf8(text: string, maxBytes = MCP_DOCUMENT_TEXT_MAX_BYTES) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return { text, truncated: false };
  // Отступаем к началу символа: байты продолжения UTF-8 — 10xxxxxx.
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return { text: new TextDecoder().decode(bytes.slice(0, end)), truncated: true };
}

/** Папка по id, имени или пути «Проект / Спецификации». */
export function resolveFolder(
  folders: readonly DocumentFolderDto[],
  ref: string,
): DocumentFolderDto {
  const withPaths = folders.map((folder) => ({
    ...folder,
    path: formatFolderPath(folderPath(folders, folder.id)),
  }));
  const byPath = withPaths.filter((folder) => folder.path === ref.trim());
  if (byPath.length === 1) return byPath[0]!;
  return pickByIdOrName(withPaths, ref, { one: 'Папка', options: 'Папки' });
}

/** Тег по id или имени. Только существующие: новые теги агент не создаёт. */
export function resolveTag(tags: readonly TagDto[], ref: string): TagDto {
  return pickByIdOrName(tags, ref, { one: 'Тег', options: 'Теги' });
}

function documentKind(document: Pick<LinkedDocumentDto, 'kind' | 'extension' | 'size'>): string {
  if (document.kind === 'note') return 'note';
  const size = document.size === null ? '' : `, ${formatBytes(document.size)}`;
  return `file .${document.extension ?? '?'}${size}`;
}

function documentLine(document: LinkedDocumentDto): string {
  const tags = document.tags.length
    ? ` · tags: ${document.tags.map((tag) => tag.name).join(', ')}`
    : '';
  const folder = document.folderPath ? ` · in ${document.folderPath}` : '';
  return `- **${document.title}** (${documentKind(document)}, id ${document.id})${folder}${tags}`;
}

export function formatDocumentList(page: DocumentListPageDto): string {
  const where = page.path.length ? formatFolderPath(page.path) : 'root';
  const lines = [
    page.isSearch
      ? `# Documents — search results (${page.total})`
      : `# Documents in ${where} (${page.total})`,
  ];
  if (!page.isSearch && page.folders.length) {
    lines.push('', '## Folders');
    for (const folder of page.folders) {
      lines.push(`- ${folder.name}/ (id ${folder.id}, ${folder.documentsCount} documents)`);
    }
  }
  lines.push('');
  if (page.documents.length === 0) lines.push('_No documents._');
  else lines.push(...page.documents.map(documentLine));
  if (page.pageCount > 1) {
    lines.push('', `Page ${page.page} of ${page.pageCount} — pass page to see more.`);
  }
  lines.push('', 'Read a document with get_document (document id).');
  return lines.join('\n');
}

export function formatFolderTree(folders: readonly DocumentFolderDto[]): string {
  if (folders.length === 0) return 'No folders: all documents are in the workspace root.';
  const children = new Map<string | null, DocumentFolderDto[]>();
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? [];
    list.push(folder);
    children.set(folder.parentId, list);
  }
  const lines = ['# Document folders', ''];
  const walk = (parentId: string | null, depth: number) => {
    const list = [...(children.get(parentId) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru'),
    );
    for (const folder of list) {
      lines.push(
        `${'  '.repeat(depth)}- ${folder.name}/ (id ${folder.id}, ${folder.documentsCount} documents)`,
      );
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

export function formatTagList(tags: readonly TagDto[]): string {
  if (tags.length === 0) return 'No document tags in this workspace.';
  return [
    '# Document tags',
    '',
    ...tags.map((tag) => `- ${tag.name} (id ${tag.id}, ${tag.documentsCount} documents)`),
  ].join('\n');
}

/** Что показать из тела документа. */
export type DocumentBody =
  | { kind: 'note'; content: string }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'link'; url: string };

export function formatDocument(input: {
  document: DocumentDto;
  folderPath: string;
  body: DocumentBody;
  tasks: readonly LinkedTaskDto[];
  url: string;
}): string {
  const { document } = input;
  const lines = [
    `# ${document.title}`,
    '',
    `id: ${document.id}`,
    `Kind: ${documentKind(document)}`,
    `Folder: ${input.folderPath || 'root'}`,
    `URL: ${input.url}`,
  ];
  if (document.kind === 'note') lines.push(`version: ${document.version} (pass it to update_note)`);
  if (document.tags.length) lines.push(`Tags: ${document.tags.map((tag) => tag.name).join(', ')}`);
  lines.push(
    `Created by ${document.createdBy?.name ?? 'deleted user'}; updated ${document.updatedAt.toISOString()}${document.updatedBy ? ` by ${document.updatedBy.name}` : ''}`,
  );
  lines.push(
    '',
    '## Linked tasks',
    ...(input.tasks.length
      ? input.tasks.map((task) => `- ${task.key} ${task.title}${task.isDone ? ' (done)' : ''}`)
      : ['_None._']),
    '',
  );

  const { body } = input;
  if (body.kind === 'note') {
    const { text, truncated } = truncateUtf8(body.content);
    lines.push('## Content (Markdown)', '', text);
    if (truncated) lines.push('', `_[Truncated to ${formatBytes(MCP_DOCUMENT_TEXT_MAX_BYTES)}.]_`);
  } else if (body.kind === 'text') {
    const { text, truncated } = truncateUtf8(body.text);
    lines.push('## File content', '', '```', text, '```');
    if (truncated || body.truncated) {
      lines.push('', '_[The file is longer — only the beginning is shown.]_');
    }
  } else {
    lines.push(
      '## Download',
      'Download link (valid for a few minutes, use it right away):',
      body.url,
      '',
      'Example: curl -sS -o <file> "<link>". Do not share the link — it is signed.',
    );
  }
  return lines.join('\n');
}

/** Раздел «Документы» в get_task. */
export function formatTaskDocuments(documents: readonly LinkedDocumentDto[]): string {
  if (documents.length === 0) return '## Documents\n_None linked._';
  return ['## Documents', ...documents.map(documentLine)].join('\n');
}
