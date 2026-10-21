import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionClient } from '@/shared/db';
import { ValidationError } from '@/shared/errors';

import { NOTE_CONTENT_MAX_LENGTH } from '../../models';

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));

const { createSystemTaskNote } = await import('./system-note.service');

const DOC = '0199f3a4-1b2c-7d3e-8f40-0000000000d1';
const documentCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>();
const linkCreate = vi.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>();
const tx = {
  document: { create: documentCreate },
  taskDocumentLink: { create: linkCreate },
} as unknown as TransactionClient;

const input = {
  workspaceId: 'ws-1',
  taskId: 'task-1',
  createdById: 'host-1',
  title: '  Встреча   21 октября — TSK-7 ',
  content: 'Обзор\r\nРешения',
};

beforeEach(() => {
  vi.clearAllMocks();
  documentCreate.mockImplementation(({ data }) =>
    Promise.resolve({ id: DOC, title: data.title as string }),
  );
  linkCreate.mockResolvedValue({});
});

describe('createSystemTaskNote', () => {
  it('creates a normalized note by the host and links it to the task in the caller tx', async () => {
    const result = await createSystemTaskNote(tx, input);

    expect(result).toEqual({ documentId: DOC, title: 'Встреча 21 октября — TSK-7' });
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          folderId: null,
          kind: 'note',
          title: 'Встреча 21 октября — TSK-7',
          titleKey: 'встреча 21 октября — tsk-7',
          content: 'Обзор\nРешения',
          createdById: 'host-1',
          updatedById: 'host-1',
        }),
      }),
    );
    expect(linkCreate).toHaveBeenCalledWith({
      data: { taskId: 'task-1', documentId: DOC, workspaceId: 'ws-1', createdById: 'host-1' },
    });
  });

  it('rejects an empty title or an oversized note before writing', async () => {
    await expect(createSystemTaskNote(tx, { ...input, title: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      createSystemTaskNote(tx, { ...input, content: 'x'.repeat(NOTE_CONTENT_MAX_LENGTH + 1) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(documentCreate).not.toHaveBeenCalled();
    expect(linkCreate).not.toHaveBeenCalled();
  });
});
