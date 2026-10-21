import { describe, expect, it } from 'vitest';

import { updateStorageSettingsSchema } from './settings.schema';

describe('updateStorageSettingsSchema', () => {
  it('treats an empty quota as the environment default', () => {
    expect(updateStorageSettingsSchema.parse({ defaultWorkspaceQuotaMb: '' })).toEqual({
      defaultWorkspaceQuotaMb: null,
    });
  });

  it('parses quota as an integer in range', () => {
    expect(
      updateStorageSettingsSchema.parse({ defaultWorkspaceQuotaMb: '2048' })
        .defaultWorkspaceQuotaMb,
    ).toBe(2048);
    for (const quota of ['0', '1.5', '-1', '2000000', 'много']) {
      expect(
        updateStorageSettingsSchema.safeParse({ defaultWorkspaceQuotaMb: quota }).success,
      ).toBe(false);
    }
  });
});
