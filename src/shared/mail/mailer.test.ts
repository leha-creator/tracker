import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailTransport = vi.fn();

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailTransport }) },
}));
vi.mock('@/shared/env', () => ({
  getEnv: () => ({
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    MAIL_FROM: 'tasker@example.com',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  }),
}));

const { isUndeliverableAddress, sendMail } = await import('./mailer');

const message = { subject: 'Тема', text: 'текст', html: '<p>текст</p>' };

beforeEach(() => {
  vi.clearAllMocks();
  sendMailTransport.mockResolvedValue({ messageId: 'm-1' });
});

describe('sendMail', () => {
  it('skips .invalid addresses without SMTP and without an error', async () => {
    await expect(sendMail({ ...message, to: 'agent-1@agents.tasker.invalid' })).resolves.toEqual({
      messageId: '',
    });
    expect(sendMailTransport).not.toHaveBeenCalled();
  });

  it('sends to a regular address', async () => {
    await expect(sendMail({ ...message, to: 'anna@example.com' })).resolves.toEqual({
      messageId: 'm-1',
    });
    expect(sendMailTransport).toHaveBeenCalledOnce();
  });
});

describe('isUndeliverableAddress', () => {
  it('matches only the .invalid TLD', () => {
    expect(isUndeliverableAddress('a@x.INVALID')).toBe(true);
    expect(isUndeliverableAddress('a@invalid.com')).toBe(false);
  });
});
