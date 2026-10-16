import { describe, expect, it } from 'vitest';

import { TASK_COMMENT_MAX_LENGTH } from '../../models/task-comment';
import { createCommentSchema, deleteCommentSchema, updateCommentSchema } from './comment.schema';

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const COMMENT_ID = '0192f3a0-0000-7000-8000-0000000000c1';

const ATTACHMENT_ID = '0192f3a0-0000-7000-8000-0000000000a1';

function bodyErrors(body: unknown) {
  const result = createCommentSchema.safeParse({ workspaceId: 'ws', taskId: TASK_ID, body });
  return result.success ? null : result.error.flatten().fieldErrors.body;
}

describe('createCommentSchema', () => {
  it('normalizes the text', () => {
    expect(
      createCommentSchema.parse({ workspaceId: 'ws', taskId: TASK_ID, body: '  a\r\n\r\n\r\nb  ' }),
    ).toEqual({ workspaceId: 'ws', taskId: TASK_ID, body: 'a\n\nb', attachmentIds: [] });
  });

  it.each([[''], ['   \n\t '], [undefined]])('rejects empty text without files %j', (body) => {
    expect(bodyErrors(body)).toEqual(['Напишите комментарий или приложите файл']);
  });

  it('accepts empty text with files', () => {
    expect(
      createCommentSchema.parse({
        workspaceId: 'ws',
        taskId: TASK_ID,
        body: '  ',
        attachmentIds: [ATTACHMENT_ID],
      }),
    ).toMatchObject({ body: '', attachmentIds: [ATTACHMENT_ID] });
  });

  it('limits files and validates their ids', () => {
    const base = { workspaceId: 'ws', taskId: TASK_ID, body: 'a' };
    expect(
      createCommentSchema.safeParse({ ...base, attachmentIds: Array(11).fill(ATTACHMENT_ID) })
        .success,
    ).toBe(false);
    expect(createCommentSchema.safeParse({ ...base, attachmentIds: ['x'] }).success).toBe(false);
  });

  it('rejects text longer than the limit', () => {
    expect(bodyErrors('a'.repeat(TASK_COMMENT_MAX_LENGTH + 1))).toHaveLength(1);
    expect(bodyErrors('a'.repeat(TASK_COMMENT_MAX_LENGTH))).toBeNull();
  });

  it('rejects a malformed task id', () => {
    expect(
      createCommentSchema.safeParse({ workspaceId: 'ws', taskId: 'abc', body: 'a' }).success,
    ).toBe(false);
  });
});

describe('updateCommentSchema / deleteCommentSchema', () => {
  it('require a valid comment id', () => {
    const base = { workspaceId: 'ws', taskId: TASK_ID };
    expect(updateCommentSchema.safeParse({ ...base, commentId: 'x', body: 'a' }).success).toBe(
      false,
    );
    expect(deleteCommentSchema.safeParse({ ...base, commentId: 'x' }).success).toBe(false);
    expect(deleteCommentSchema.parse({ ...base, commentId: COMMENT_ID })).toEqual({
      ...base,
      commentId: COMMENT_ID,
    });
  });
});
