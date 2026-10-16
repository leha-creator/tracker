import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AccessModule from '@/shared/access';
import type { AuthSession } from '@/shared/auth';
import { ForbiddenError, InternalError } from '@/shared/errors';

const requireWorkspaceAccess = vi.fn();
const sendMail = vi.fn();
const createInvitation = vi.fn();
const acceptInvitationApi = vi.fn();
const findForRecipient = vi.fn();
const notifyByEmail = vi.fn();

vi.mock('@/shared/access', async (importOriginal) => ({
  ...(await importOriginal<typeof AccessModule>()),
  requireWorkspaceAccess: (...args: unknown[]) => requireWorkspaceAccess(...args) as unknown,
}));
vi.mock('@/modules/notifications', () => ({
  notifyByEmail: (...args: unknown[]) => notifyByEmail(...args) as unknown,
}));
vi.mock('@/shared/mail', () => ({
  sendMail: (...args: unknown[]) => sendMail(...args) as unknown,
}));
vi.mock('../workspace/workspace.repository', () => ({
  workspaceRepository: {
    findById: () => Promise.resolve({ id: 'ws-1', slug: 'team', name: 'Team' }),
  },
}));
vi.mock('./invitation.repository', () => ({
  invitationRepository: {
    findForRecipient: () => findForRecipient() as unknown,
    findInWorkspace: vi.fn(),
    listPending: vi.fn(),
  },
}));
vi.mock('../../organization-api', () => ({
  callOrganizationApi: (call: (api: unknown, headers: Headers) => Promise<unknown>) =>
    call({ createInvitation, acceptInvitation: acceptInvitationApi }, new Headers()),
}));

const { acceptInvitation, getInvitationForRecipient, inviteMember } =
  await import('./invitation.service');

const owner: AuthSession = {
  user: {
    id: 'user-owner',
    email: 'Owner@Example.com',
    name: 'Owner',
    image: null,
    role: 'user',
    banned: false,
  },
  session: { id: 's-1', expiresAt: new Date('2030-01-01') },
};
const bob: AuthSession = {
  ...owner,
  user: { ...owner.user, id: 'user-bob', email: 'bob@example.com' },
};

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({
    userId: 'user-owner',
    workspaceId: 'ws-1',
    memberId: 'm-1',
    role: 'owner',
  });
  createInvitation.mockResolvedValue({ id: 'inv-1', expiresAt: inTwoDays() });
});

describe('inviteMember', () => {
  it('sends email and returns invite link', async () => {
    sendMail.mockResolvedValue({ messageId: 'x' });
    const result = await inviteMember(owner, {
      workspaceId: 'ws-1',
      email: 'bob@example.com',
      role: 'member',
    });
    expect(result).toEqual({
      invitationId: 'inv-1',
      inviteUrl: 'http://localhost:3000/invite/inv-1',
      emailSent: true,
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bob@example.com' }));
    expect(notifyByEmail).toHaveBeenCalledWith('bob@example.com', {
      type: 'workspace_invitation',
      workspaceId: 'ws-1',
      actorId: 'user-owner',
      invitationId: 'inv-1',
      payload: { workspaceSlug: 'team', workspaceName: 'Team', actorName: 'Owner' },
    });
  });

  it('keeps invitation when email fails', async () => {
    sendMail.mockRejectedValue(new InternalError('smtp down'));
    const result = await inviteMember(owner, {
      workspaceId: 'ws-1',
      email: 'bob@example.com',
      role: 'member',
    });
    expect(result.emailSent).toBe(false);
    expect(result.inviteUrl).toBe('http://localhost:3000/invite/inv-1');
  });

  it('rejects inviting yourself', async () => {
    await expect(
      inviteMember(owner, { workspaceId: 'ws-1', email: 'owner@example.com', role: 'member' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { email: expect.any(Array) },
    });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('forbids non-owner', async () => {
    requireWorkspaceAccess.mockRejectedValue(new ForbiddenError());
    await expect(
      inviteMember(owner, { workspaceId: 'ws-1', email: 'bob@example.com', role: 'member' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(createInvitation).not.toHaveBeenCalled();
  });
});

describe('recipient flow', () => {
  const row = {
    id: 'inv-1',
    workspaceId: 'ws-1',
    email: 'bob@example.com',
    role: 'member',
    status: 'pending',
    expiresAt: inTwoDays(),
    workspace: { name: 'Team', slug: 'team' },
    inviter: { name: 'Owner' },
  };

  it('shows wrong-recipient state with masked email', async () => {
    findForRecipient.mockResolvedValue(row);
    const dto = await getInvitationForRecipient(owner, 'inv-1');
    expect(dto.state).toBe('wrong-recipient');
    expect(dto.maskedEmail).toBe('b***@example.com');
  });

  it('returns NOT_FOUND for unknown invitation', async () => {
    findForRecipient.mockResolvedValue(null);
    await expect(getInvitationForRecipient(bob, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('accepts for recipient and returns workspace slug', async () => {
    findForRecipient.mockResolvedValue(row);
    await expect(acceptInvitation(bob, { invitationId: 'inv-1' })).resolves.toEqual({
      workspaceSlug: 'team',
    });
    expect(acceptInvitationApi).toHaveBeenCalledWith(
      expect.objectContaining({ body: { invitationId: 'inv-1' } }),
    );
  });

  it('does not accept for another user', async () => {
    findForRecipient.mockResolvedValue(row);
    await expect(acceptInvitation(owner, { invitationId: 'inv-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(acceptInvitationApi).not.toHaveBeenCalled();
  });
});
