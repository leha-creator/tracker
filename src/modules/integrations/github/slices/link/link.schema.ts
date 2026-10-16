import { z } from 'zod';

import { githubIdField } from '../installation/installation.schema';

const workspaceIdField = z.string({ error: 'Не указано пространство' }).min(1);
const taskIdField = z.string({ error: 'Не указана задача' }).min(1);

/** `https://github.com/<owner>/<repo>/pull/<n>` (с хвостом `/files`, `#…` и т.п.). */
const PULL_REQUEST_PATH_RE =
  /^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([1-9]\d{0,8})(?:\/.*)?$/;

export const pullRequestUrlField = z
  .string({ error: 'Вставьте ссылку на PR' })
  .trim()
  .min(1, { error: 'Вставьте ссылку на PR' })
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Это не ссылка' });
      return z.NEVER;
    }
    const match = PULL_REQUEST_PATH_RE.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !match) {
      ctx.addIssue({
        code: 'custom',
        message: 'Нужна ссылка вида https://github.com/owner/repo/pull/12',
      });
      return z.NEVER;
    }
    return { owner: match[1]!, repo: match[2]!, number: Number(match[3]) };
  });

export const linkPullRequestSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: taskIdField,
  url: pullRequestUrlField,
});

export const dismissPullRequestSchema = z.object({
  workspaceId: workspaceIdField,
  taskId: taskIdField,
  pullRequestId: githubIdField,
});
