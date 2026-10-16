import { describe, expect, it, vi } from 'vitest';

import { allowSessionCreation } from './agent-session-guard';

describe('allowSessionCreation', () => {
  it('blocks a session for an agent', async () => {
    const findIsAgent = vi.fn().mockResolvedValue(true);
    await expect(allowSessionCreation({ userId: 'agent-1' }, findIsAgent)).resolves.toBe(false);
    expect(findIsAgent).toHaveBeenCalledWith('agent-1');
  });

  it('allows a session for a human', async () => {
    const findIsAgent = vi.fn().mockResolvedValue(false);
    await expect(allowSessionCreation({ userId: 'user-1' }, findIsAgent)).resolves.toBe(true);
  });
});
