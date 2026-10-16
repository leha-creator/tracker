import { describe, expect, it } from 'vitest';

import { completeUploadSchema, requestUploadSchema } from './attachment.schema';

const TASK_ID = '0192f3a0-0000-7000-8000-000000000010';
const ATTACHMENT_ID = '0192f3a0-0000-7000-8000-0000000000a1';

const request = {
  workspaceId: 'ws-1',
  taskId: TASK_ID,
  target: 'task',
  fileName: 'report.pdf',
  size: 1024,
};

describe('requestUploadSchema', () => {
  it('accepts a valid request', () => {
    expect(requestUploadSchema.parse(request)).toEqual(request);
  });

  it('rejects invalid task id and unknown target', () => {
    expect(requestUploadSchema.safeParse({ ...request, taskId: 'x' }).success).toBe(false);
    expect(requestUploadSchema.safeParse({ ...request, target: 'project' }).success).toBe(false);
  });

  it('rejects non-integer and negative sizes', () => {
    expect(requestUploadSchema.safeParse({ ...request, size: -1 }).success).toBe(false);
    expect(requestUploadSchema.safeParse({ ...request, size: 1.5 }).success).toBe(false);
    expect(requestUploadSchema.safeParse({ ...request, size: '10' }).success).toBe(false);
  });

  it('rejects empty file name', () => {
    expect(requestUploadSchema.safeParse({ ...request, fileName: '' }).success).toBe(false);
  });
});

describe('completeUploadSchema', () => {
  it('requires attachment UUID', () => {
    const key = { workspaceId: 'ws-1', taskId: TASK_ID, attachmentId: ATTACHMENT_ID };
    expect(completeUploadSchema.parse(key)).toEqual(key);
    expect(completeUploadSchema.safeParse({ ...key, attachmentId: '1' }).success).toBe(false);
  });
});
