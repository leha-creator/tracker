import { describe, expect, it } from 'vitest';

import {
  assertAttachmentLimit,
  assertAttachmentSize,
  assertCanDeleteAttachment,
  assertCanRemoveFromComment,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_SIZE,
  attachmentStorageKey,
  attachmentTypeOf,
  canDeleteAttachment,
  canViewAttachment,
  COMMENT_ATTACHMENTS_LIMIT,
  contentDisposition,
  fileExtension,
  formatFileSize,
  matchesImageSignature,
  requiresSignatureCheck,
  resolveAttachmentType,
  sanitizeFileName,
  TASK_ATTACHMENTS_LIMIT,
} from './task-attachment';

const owner = { userId: 'u-owner', role: 'owner' as const };
const uploader = { userId: 'u-1', role: 'member' as const };
const member = { userId: 'u-2', role: 'member' as const };

const taskFile = { uploaderId: 'u-1', target: 'task' as const, commentId: null };
const commentFile = { uploaderId: 'u-1', target: 'comment' as const, commentId: 'c-1' };
const draft = { uploaderId: 'u-1', target: 'comment' as const, commentId: null };

describe('sanitizeFileName', () => {
  it('strips paths, control characters and quotes', () => {
    expect(sanitizeFileName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    expect(sanitizeFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(sanitizeFileName('bad\u0000"name\u0007.txt')).toBe('badname.txt');
    expect(sanitizeFileName('  много   пробелов .png ')).toBe('много пробелов .png');
  });

  it('keeps Cyrillic in NFC', () => {
    const decomposed = 'и\u0306.txt'; // «й» из двух кодовых точек
    expect(sanitizeFileName(decomposed)).toBe('й.txt');
  });

  it('truncates long names keeping the extension', () => {
    const name = sanitizeFileName(`${'я'.repeat(300)}.docx`);
    expect(Array.from(name)).toHaveLength(200);
    expect(name.endsWith('.docx')).toBe(true);
  });

  it('rejects empty names', () => {
    expect(() => sanitizeFileName('   ')).toThrow('Некорректное имя файла');
    expect(() => sanitizeFileName('dir/')).toThrow('Некорректное имя файла');
    expect(() => sanitizeFileName('..')).toThrow('Некорректное имя файла');
  });
});

describe('attachment types', () => {
  it('resolves type by extension, case-insensitively', () => {
    expect(resolveAttachmentType('Photo.JPG')).toEqual({
      contentType: 'image/jpeg',
      kind: 'image',
      previewable: true,
    });
    expect(resolveAttachmentType('data.csv').contentType).toBe('text/csv');
  });

  it('rejects unknown and missing extensions', () => {
    expect(() => resolveAttachmentType('setup.exe')).toThrow('Такой тип файла нельзя прикрепить');
    expect(() => resolveAttachmentType('README')).toThrow();
    expect(() => resolveAttachmentType('.png')).toThrow();
    expect(() => resolveAttachmentType('toString')).toThrow();
  });

  it('does not preview SVG', () => {
    expect(resolveAttachmentType('logo.svg').previewable).toBe(false);
  });

  it('maps stored content type back to its kind', () => {
    expect(attachmentTypeOf('application/pdf').kind).toBe('pdf');
    expect(attachmentTypeOf('application/x-unknown').previewable).toBe(false);
  });

  it('builds accept list from the allowlist', () => {
    expect(ATTACHMENT_ACCEPT.split(',')).toContain('.pdf');
    expect(ATTACHMENT_ACCEPT).not.toContain('.exe');
  });

  it('extracts extension', () => {
    expect(fileExtension('archive.tar.GZ')).toBe('gz');
    expect(fileExtension('.gitignore')).toBeNull();
    expect(fileExtension('name.')).toBeNull();
  });
});

describe('limits', () => {
  it('checks size bounds', () => {
    expect(() => assertAttachmentSize(1)).not.toThrow();
    expect(() => assertAttachmentSize(ATTACHMENT_MAX_SIZE)).not.toThrow();
    expect(() => assertAttachmentSize(ATTACHMENT_MAX_SIZE + 1)).toThrow('Файл больше 25 МБ');
    expect(() => assertAttachmentSize(0)).toThrow('Пустой файл');
    expect(() => assertAttachmentSize(1.5)).toThrow();
  });

  it('checks count per target', () => {
    expect(() => assertAttachmentLimit(TASK_ATTACHMENTS_LIMIT - 1, 'task')).not.toThrow();
    expect(() => assertAttachmentLimit(TASK_ATTACHMENTS_LIMIT, 'task')).toThrow('не больше 20');
    expect(() => assertAttachmentLimit(COMMENT_ATTACHMENTS_LIMIT, 'comment')).toThrow(
      'не больше 10',
    );
  });
});

describe('matchesImageSignature', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const text = (value: string) => new TextEncoder().encode(value);

  it('accepts real image headers', () => {
    expect(
      matchesImageSignature('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe(true);
    expect(matchesImageSignature('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesImageSignature('image/gif', text('GIF89a...'))).toBe(true);
    expect(matchesImageSignature('image/webp', text('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
  });

  it('rejects spoofed content', () => {
    expect(matchesImageSignature('image/png', text('<html><script>'))).toBe(false);
    expect(matchesImageSignature('image/webp', text('RIFF\0\0\0\0WAVE'))).toBe(false);
    expect(matchesImageSignature('image/jpeg', new Uint8Array())).toBe(false);
  });

  it('skips other types', () => {
    expect(requiresSignatureCheck('application/pdf')).toBe(false);
    expect(requiresSignatureCheck('image/svg+xml')).toBe(false);
    expect(matchesImageSignature('application/pdf', text('anything'))).toBe(true);
  });
});

describe('contentDisposition', () => {
  it('encodes UTF-8 name with ASCII fallback', () => {
    expect(contentDisposition('Отчёт (итог).pdf', 'attachment')).toBe(
      'attachment; filename="_____ (____).pdf"; filename*=UTF-8\'\'%D0%9E%D1%82%D1%87%D1%91%D1%82%20%28%D0%B8%D1%82%D0%BE%D0%B3%29.pdf',
    );
  });

  it('escapes quotes and backslashes in fallback', () => {
    expect(contentDisposition('a\\b.png', 'inline')).toMatch(/^inline; filename="a_b\.png";/);
  });
});

describe('attachmentStorageKey', () => {
  it('does not contain the file name', () => {
    expect(attachmentStorageKey('ws-1', 't-1', 'a-1')).toBe('ws/ws-1/tasks/t-1/a-1');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 Б');
    expect(formatFileSize(1536)).toBe('1,5 КБ');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 МБ');
  });
});

describe('attachment rights', () => {
  it('lets uploader and owner delete task and comment files', () => {
    expect(canDeleteAttachment(taskFile, uploader)).toBe(true);
    expect(canDeleteAttachment(taskFile, owner)).toBe(true);
    expect(canDeleteAttachment(commentFile, owner)).toBe(true);
    expect(canDeleteAttachment(taskFile, member)).toBe(false);
    expect(() => assertCanDeleteAttachment(taskFile, member)).toThrow('загрузивший');
  });

  it('keeps drafts private to the uploader', () => {
    expect(canViewAttachment(draft, uploader)).toBe(true);
    expect(canViewAttachment(draft, owner)).toBe(false);
    expect(canDeleteAttachment(draft, owner)).toBe(false);
    expect(canViewAttachment(commentFile, member)).toBe(true);
  });

  it('handles deleted uploader', () => {
    const orphan = { ...taskFile, uploaderId: null };
    expect(canDeleteAttachment(orphan, owner)).toBe(true);
    expect(canDeleteAttachment(orphan, member)).toBe(false);
    expect(canViewAttachment({ ...draft, uploaderId: null }, member)).toBe(false);
  });

  it('forbids removing the last file of an empty comment', () => {
    expect(() => assertCanRemoveFromComment({ bodyLength: 0, attachmentsLeft: 0 })).toThrow(
      'удалите комментарий целиком',
    );
    expect(() => assertCanRemoveFromComment({ bodyLength: 3, attachmentsLeft: 0 })).not.toThrow();
    expect(() => assertCanRemoveFromComment({ bodyLength: 0, attachmentsLeft: 1 })).not.toThrow();
  });
});
