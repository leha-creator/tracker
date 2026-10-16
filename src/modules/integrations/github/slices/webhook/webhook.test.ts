import { createHmac } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import installationCreated from './__fixtures__/installation-created.json';
import installationRepositoriesChanged from './__fixtures__/installation-repositories-changed.json';

const repo = {
  upsertInstallation: vi.fn(),
  syncRepositories: vi.fn(),
  upsertRepositories: vi.fn(),
  removeRepositories: vi.fn(),
  deleteInstallation: vi.fn(),
  setSuspended: vi.fn(),
};
const webhookRepo = {
  recordDelivery: vi.fn<(id: string, event: string) => Promise<void>>(),
  forgetDelivery: vi.fn<(id: string) => Promise<void>>(),
  purgeDeliveriesBefore: vi.fn<(before: Date) => Promise<number>>(),
};
const transaction = vi.fn((run: (tx: unknown) => Promise<unknown>) => run({ tx: true }));

vi.mock('@/shared/env', () => ({ getEnv: () => ({ LOG_LEVEL: 'silent' }) }));
vi.mock('@/shared/github-app', () => ({
  getGithubAppConfig: () => ({ webhookSecret: 'webhook-secret-value' }),
}));
vi.mock('@/shared/db', () => ({
  prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => transaction(run) },
  isUniqueViolation: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));
vi.mock('../installation/installation.repository', () => ({ installationRepository: repo }));
vi.mock('./webhook.repository', () => ({ webhookRepository: webhookRepo }));

const { verifyGithubWebhookSignature, verifyWebhookSignature } =
  await import('./webhook.signature');
const { handleGithubWebhook } = await import('./webhook.service');

const SECRET = 'webhook-secret-value';
function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) => run({ tx: true }));
  webhookRepo.recordDelivery.mockResolvedValue();
  webhookRepo.forgetDelivery.mockResolvedValue();
  repo.syncRepositories.mockResolvedValue({ removed: 0 });
  repo.removeRepositories.mockResolvedValue(1);
});

describe('webhook signature', () => {
  const body = '{"zen":"Keep it simple"}';

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyGithubWebhookSignature(body, sign(body))).toBe(true);
  });

  it.each([
    ['wrong secret', sign(body, 'another-secret-value')],
    ['tampered body', sign(`${body} `)],
    ['no prefix', sign(body).slice('sha256='.length)],
    ['sha1 header', `sha1=${'a'.repeat(40)}`],
    ['shorter digest', sign(body).slice(0, -2)],
    ['not hex', 'sha256=zz'],
    ['missing', null],
  ])('rejects %s', (_label, header) => {
    expect(verifyWebhookSignature(body, header, SECRET)).toBe(false);
  });
});

describe('handleGithubWebhook', () => {
  it('ignores events without handler and does not record delivery', async () => {
    await expect(
      handleGithubWebhook({ event: 'star', deliveryId: 'd-1', payload: { action: 'created' } }),
    ).resolves.toBe('ignored');
    expect(webhookRepo.recordDelivery).not.toHaveBeenCalled();
  });

  it('skips repeated delivery', async () => {
    webhookRepo.recordDelivery.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    await expect(
      handleGithubWebhook({
        event: 'installation',
        deliveryId: 'd-1',
        payload: installationCreated,
      }),
    ).resolves.toBe('duplicate');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('forgets delivery and rethrows when handler fails', async () => {
    repo.upsertInstallation.mockRejectedValue(new Error('db down'));
    await expect(
      handleGithubWebhook({
        event: 'installation',
        deliveryId: 'd-2',
        payload: installationCreated,
      }),
    ).rejects.toThrow('db down');
    expect(webhookRepo.forgetDelivery).toHaveBeenCalledWith('d-2');
  });

  it('rejects malformed payload as handler failure', async () => {
    await expect(
      handleGithubWebhook({
        event: 'installation',
        deliveryId: 'd-3',
        payload: { action: 'created' },
      }),
    ).rejects.toThrow();
    expect(webhookRepo.forgetDelivery).toHaveBeenCalledWith('d-3');
  });
});

describe('installation handlers', () => {
  it('stores installation and its repositories on created', async () => {
    await expect(
      handleGithubWebhook({
        event: 'installation',
        deliveryId: 'd-4',
        payload: installationCreated,
      }),
    ).resolves.toBe('handled');
    expect(repo.upsertInstallation).toHaveBeenCalledWith(
      { tx: true },
      {
        id: 77n,
        accountId: 9n,
        accountLogin: 'acme',
        accountType: 'Organization',
        suspendedAt: null,
      },
    );
    expect(repo.syncRepositories).toHaveBeenCalledWith({ tx: true }, 77n, [
      { id: 5n, fullName: 'acme/web', private: true, defaultBranch: null },
      { id: 6n, fullName: 'acme/api', private: false, defaultBranch: null },
    ]);
  });

  it('deletes installation', async () => {
    await handleGithubWebhook({
      event: 'installation',
      deliveryId: 'd-5',
      payload: { ...installationCreated, action: 'deleted' },
    });
    expect(repo.deleteInstallation).toHaveBeenCalledWith({ tx: true }, 77n);
  });

  it('marks suspension and lifts it', async () => {
    await handleGithubWebhook({
      event: 'installation',
      deliveryId: 'd-6',
      payload: { ...installationCreated, action: 'suspend' },
    });
    expect(repo.setSuspended).toHaveBeenLastCalledWith({ tx: true }, 77n, expect.any(Date));
    await handleGithubWebhook({
      event: 'installation',
      deliveryId: 'd-7',
      payload: { ...installationCreated, action: 'unsuspend' },
    });
    expect(repo.setSuspended).toHaveBeenLastCalledWith({ tx: true }, 77n, null);
  });

  it('ignores unknown installation actions', async () => {
    await expect(
      handleGithubWebhook({
        event: 'installation',
        deliveryId: 'd-8',
        payload: { ...installationCreated, action: 'something_new' },
      }),
    ).resolves.toBe('ignored');
  });

  it('adds and removes repositories', async () => {
    await expect(
      handleGithubWebhook({
        event: 'installation_repositories',
        deliveryId: 'd-9',
        payload: installationRepositoriesChanged,
      }),
    ).resolves.toBe('handled');
    expect(repo.upsertRepositories).toHaveBeenCalledWith({ tx: true }, 77n, [
      { id: 7n, fullName: 'acme/docs', private: false, defaultBranch: null },
    ]);
    expect(repo.removeRepositories).toHaveBeenCalledWith({ tx: true }, [6n]);
  });
});
