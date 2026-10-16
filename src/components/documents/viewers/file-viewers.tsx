import { DownloadIcon, InfoIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  detectCsvDelimiter,
  formatBytes,
  parseDelimited,
  type DocumentDto,
} from '@/modules/documents/client';

import { documentFileHref } from '../docs-href';
import { DocumentIcon, documentKindLabel } from '../document-icon';
import { MarkdownView } from '../markdown/markdown-view';
import { ImageViewer } from './image-viewer';
import { prettyJson } from './pick-viewer';
import { TextViewer } from './text-viewer';

/** Файл показан не целиком: читается только первый мегабайт. */
export function TruncatedNotice({ documentId }: { documentId: string }) {
  return (
    <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <InfoIcon className="size-4 shrink-0" aria-hidden />
      Показан первый 1 МБ файла.
      <a
        href={documentFileHref(documentId)}
        download
        className="font-medium text-primary underline"
      >
        Скачать целиком
      </a>
    </p>
  );
}

export function InlineFileViewer({
  document,
  viewer,
}: {
  document: DocumentDto;
  viewer: 'image' | 'pdf' | 'audio' | 'video';
}) {
  const src = documentFileHref(document.id, { inline: true });
  switch (viewer) {
    case 'image':
      return <ImageViewer src={src} alt={document.title} />;
    case 'pdf':
      return (
        <div className="grid gap-2">
          <iframe
            src={src}
            title={`PDF: ${document.title}`}
            className="h-[80dvh] w-full rounded-lg border bg-muted"
          />
          <p className="text-sm text-muted-foreground">
            Документ не отображается?{' '}
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline"
            >
              Откройте его в новой вкладке
            </a>
            .
          </p>
        </div>
      );
    case 'audio':
      return (
        <audio controls preload="metadata" src={src} className="w-full">
          Браузер не поддерживает воспроизведение аудио.
        </audio>
      );
    case 'video':
      return (
        <video
          controls
          preload="metadata"
          src={src}
          className="max-h-[80dvh] w-full rounded-lg border bg-black"
        >
          Браузер не поддерживает воспроизведение видео.
        </video>
      );
  }
}

export function TextFileViewer({
  viewer,
  text,
}: {
  viewer: 'markdown' | 'csv' | 'tsv' | 'json' | 'code';
  text: string;
}) {
  if (viewer === 'markdown') {
    return (
      <div className="rounded-lg border bg-card px-6 py-5">
        <MarkdownView source={text} />
      </div>
    );
  }
  if (viewer === 'csv' || viewer === 'tsv') {
    const table = parseDelimited(text, viewer === 'tsv' ? '\t' : detectCsvDelimiter(text));
    return <CsvTable rows={table.rows} truncated={table.truncated} />;
  }
  if (viewer === 'json') {
    const json = prettyJson(text);
    return (
      <div className="grid gap-2">
        {!json.valid && (
          <p className="text-sm text-muted-foreground">
            Файл не разобран как JSON — показан как есть.
          </p>
        )}
        <TextViewer text={json.text} />
      </div>
    );
  }
  return <TextViewer text={text} />;
}

function CsvTable({ rows, truncated }: { rows: string[][]; truncated: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Файл пуст.</p>;
  const [header = [], ...body] = rows;
  const columns = Math.max(...rows.map((row) => row.length));
  return (
    <div className="grid gap-2">
      <div className="max-h-[75dvh] overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {Array.from({ length: columns }, (_, index) => (
                <th
                  key={index}
                  scope="col"
                  className="border-b px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {header[index] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="even:bg-muted/30">
                {Array.from({ length: columns }, (_, index) => (
                  <td key={index} className="border-b px-3 py-1.5 align-top whitespace-pre-wrap">
                    {row[index] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Строк: {body.length}
        {truncated && ' — показаны первые 500'}
      </p>
    </div>
  );
}

/** Файл без предпросмотра: карточка и скачивание. */
export function FileFallback({ document }: { document: DocumentDto }) {
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
      <DocumentIcon
        kind={document.kind}
        fileKind={document.fileKind}
        className="size-10 text-muted-foreground"
      />
      <div className="grid gap-1">
        <p className="font-medium">{document.fileName}</p>
        <p className="text-sm text-muted-foreground">
          {documentKindLabel(document.kind, document.fileKind)}
          {document.size !== null && ` · ${formatBytes(document.size)}`} — предпросмотр для этого
          типа недоступен
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <a href={documentFileHref(document.id)} download>
            <DownloadIcon aria-hidden />
            Скачать
          </a>
        </Button>
      </div>
    </div>
  );
}
