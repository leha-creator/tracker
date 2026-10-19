import { describe, expect, it } from 'vitest';

import { setStorageQuotaSchema, transferOwnershipSchema } from './workspace.schema';

describe('setStorageQuotaSchema', () => {
  it('treats an empty field as the default quota', () => {
    expect(setStorageQuotaSchema.parse({ workspaceId: 'ws-1', quotaMb: ' ' })).toEqual({
      workspaceId: 'ws-1',
      quotaMb: null,
    });
    expect(setStorageQuotaSchema.parse({ workspaceId: 'ws-1' }).quotaMb).toBeNull();
  });

  it('accepts whole megabytes within the limits', () => {
    expect(setStorageQuotaSchema.parse({ workspaceId: 'ws-1', quotaMb: '0' }).quotaMb).toBe(0);
    expect(setStorageQuotaSchema.parse({ workspaceId: 'ws-1', quotaMb: '2048' }).quotaMb).toBe(
      2048,
    );
  });

  it.each(['-1', '1.5', 'abc', '1000001'])('rejects %s', (quotaMb) => {
    expect(setStorageQuotaSchema.safeParse({ workspaceId: 'ws-1', quotaMb }).success).toBe(false);
  });
});

describe('transferOwnershipSchema', () => {
  it('reads the checkbox', () => {
    expect(
      transferOwnershipSchema.parse({
        workspaceId: 'ws-1',
        userId: 'u-2',
        demotePreviousOwners: 'on',
      }).demotePreviousOwners,
    ).toBe(true);
    expect(
      transferOwnershipSchema.parse({ workspaceId: 'ws-1', userId: 'u-2' }).demotePreviousOwners,
    ).toBe(false);
  });
});
