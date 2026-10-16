import { describe, expect, it } from 'vitest';

import {
  assertDocumentFileSize,
  contentDisposition,
  DOCUMENT_DOWNLOAD_TTL_SECONDS,
  DOCUMENT_FILE_MAX_SIZE,
  DOCUMENT_MEDIA_TTL_SECONDS,
  documentFileTypeOf,
  documentStorageKey,
  downloadTtlSeconds,
  extensionsOfKinds,
  findDocumentFileType,
  formatBytes,
  isInlineViewable,
  isTextViewer,
  matchesFileSignature,
  resolveDocumentFileType,
  sanitizeFileName,
  titleFromFileName,
} from './document-type';

const bytes = (...values: number[]) => new Uint8Array(values);
const asciiBytes = (value: string) => new TextEncoder().encode(value);

describe('findDocumentFileType', () => {
  it('maps allowlisted extensions case-insensitively', () => {
    expect(findDocumentFileType('Photo.JPG')).toMatchObject({
      extension: 'jpg',
      contentType: 'image/jpeg',
      viewer: 'image',
      signature: 'jpeg',
    });
    expect(findDocumentFileType('spec.pdf')).toMatchObject({ viewer: 'pdf', signature: 'pdf' });
    expect(findDocumentFileType('notes.md')).toMatchObject({ viewer: 'markdown' });
    expect(findDocumentFileType('data.csv')).toMatchObject({ viewer: 'csv' });
    expect(findDocumentFileType('clip.mp4')).toMatchObject({ viewer: 'video' });
    expect(findDocumentFileType('report.docx')).toMatchObject({ viewer: null, kind: 'document' });
  });

  it('never stores markup as renderable content', () => {
    expect(findDocumentFileType('page.html')).toMatchObject({
      contentType: 'text/plain',
      viewer: 'code',
    });
    expect(findDocumentFileType('feed.xml')?.contentType).toBe('text/plain');
    expect(findDocumentFileType('logo.svg')).toMatchObject({ viewer: null });
  });

  it('rejects unknown, missing and prototype extensions', () => {
    expect(findDocumentFileType('virus.exe')).toBeNull();
    expect(findDocumentFileType('README')).toBeNull();
    expect(findDocumentFileType('.env')).toBeNull();
    expect(findDocumentFileType('x.constructor')).toBeNull();
    expect(() => resolveDocumentFileType('a.exe')).toThrow(/тип файла/);
  });
});

describe('documentFileTypeOf', () => {
  it('falls back to download-only for an extension removed from the allowlist', () => {
    expect(documentFileTypeOf('exe', 'application/octet-stream')).toEqual({
      extension: 'exe',
      contentType: 'application/octet-stream',
      kind: 'document',
      viewer: null,
      signature: null,
    });
  });
});

describe('viewer helpers', () => {
  it('detects text viewers', () => {
    expect(isTextViewer('markdown')).toBe(true);
    expect(isTextViewer('code')).toBe(true);
    expect(isTextViewer('image')).toBe(false);
    expect(isTextViewer(null)).toBe(false);
  });

  it('allows inline only for images, pdf and media', () => {
    expect(isInlineViewable(resolveDocumentFileType('a.png'))).toBe(true);
    expect(isInlineViewable(resolveDocumentFileType('a.pdf'))).toBe(true);
    expect(isInlineViewable(resolveDocumentFileType('a.webm'))).toBe(true);
    expect(isInlineViewable(resolveDocumentFileType('a.html'))).toBe(false);
    expect(isInlineViewable(resolveDocumentFileType('a.svg'))).toBe(false);
  });

  it('gives media a longer link lifetime', () => {
    expect(downloadTtlSeconds(resolveDocumentFileType('a.mp3'), true)).toBe(
      DOCUMENT_MEDIA_TTL_SECONDS,
    );
    expect(downloadTtlSeconds(resolveDocumentFileType('a.mp3'), false)).toBe(
      DOCUMENT_DOWNLOAD_TTL_SECONDS,
    );
    expect(downloadTtlSeconds(resolveDocumentFileType('a.png'), true)).toBe(
      DOCUMENT_DOWNLOAD_TTL_SECONDS,
    );
  });

  it('lists extensions of kinds', () => {
    const media = extensionsOfKinds(['audio', 'video']);
    expect(media).toEqual(expect.arrayContaining(['mp3', 'mp4', 'webm']));
    expect(media).not.toContain('png');
  });
});

describe('matchesFileSignature', () => {
  it('checks image and pdf signatures', () => {
    const png = resolveDocumentFileType('a.png');
    expect(matchesFileSignature(png, bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      true,
    );
    expect(matchesFileSignature(png, asciiBytes('<html>'))).toBe(false);

    const pdf = resolveDocumentFileType('a.pdf');
    expect(matchesFileSignature(pdf, asciiBytes('%PDF-1.7'))).toBe(true);
    expect(matchesFileSignature(pdf, asciiBytes('<script>'))).toBe(false);

    const webp = resolveDocumentFileType('a.webp');
    expect(matchesFileSignature(webp, asciiBytes('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
  });

  it('passes types without a signature', () => {
    expect(matchesFileSignature(resolveDocumentFileType('a.txt'), asciiBytes('hello'))).toBe(true);
  });
});

describe('sanitizeFileName', () => {
  it('drops path, control chars and quotes', () => {
    expect(sanitizeFileName('../../etc/"pass\u0000wd".txt')).toBe('passwd.txt');
    expect(sanitizeFileName('C:\\Users\\me\\  отчёт   2026.pdf ')).toBe('отчёт 2026.pdf');
  });

  it('rejects empty names', () => {
    expect(() => sanitizeFileName('  ')).toThrow();
    expect(() => sanitizeFileName('dir/..')).toThrow();
  });

  it('truncates long names keeping the extension', () => {
    const name = sanitizeFileName(`${'я'.repeat(300)}.pdf`);
    expect(Array.from(name)).toHaveLength(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('misc', () => {
  it('derives a title from the file name', () => {
    expect(titleFromFileName('Отчёт за май.pdf')).toBe('Отчёт за май');
    expect(titleFromFileName('README')).toBe('README');
  });

  it('validates size', () => {
    expect(() => assertDocumentFileSize(0)).toThrow(/Пустой/);
    expect(() => assertDocumentFileSize(DOCUMENT_FILE_MAX_SIZE + 1)).toThrow(/больше/);
    expect(() => assertDocumentFileSize(DOCUMENT_FILE_MAX_SIZE)).not.toThrow();
  });

  it('builds storage key under the workspace prefix', () => {
    expect(documentStorageKey('ws-1', 'doc-1')).toBe('ws/ws-1/docs/doc-1');
  });

  it('encodes content disposition', () => {
    expect(contentDisposition('План "Q1".pdf', 'inline')).toBe(
      `inline; filename="____ _Q1_.pdf"; filename*=UTF-8''%D0%9F%D0%BB%D0%B0%D0%BD%20%22Q1%22.pdf`,
    );
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(1536)).toBe('1,5 КБ');
    expect(formatBytes(1024 ** 3)).toBe('1 ГБ');
  });
});
