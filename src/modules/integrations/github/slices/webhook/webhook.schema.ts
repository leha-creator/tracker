import { z } from 'zod';

/**
 * Zod-схемы вебхуков GitHub: только поля, которые мы используем (остальные отбрасываются).
 * Id GitHub — числа; в БД — BigInt.
 */

const githubId = z.number().int().positive();

export const accountSchema = z.object({
  id: githubId,
  login: z.string().optional(),
  slug: z.string().optional(),
  type: z.string().optional(),
});

export const installationSchema = z.object({
  id: githubId,
  account: accountSchema.nullable().optional(),
  suspended_at: z.string().nullable().optional(),
});

/** Репозиторий в событиях установки (без default_branch). */
export const installationRepositorySchema = z.object({
  id: githubId,
  full_name: z.string(),
  private: z.boolean(),
});

/** Репозиторий в событиях репозитория (pull_request, push…). */
export const repositorySchema = installationRepositorySchema.extend({
  default_branch: z.string().optional(),
});

export const senderSchema = z.object({ id: githubId, login: z.string() }).nullable().optional();

export const installationEventSchema = z.object({
  action: z.string(),
  installation: installationSchema,
  repositories: z.array(installationRepositorySchema).nullable().optional(),
});

export const installationRepositoriesEventSchema = z.object({
  action: z.string(),
  installation: installationSchema,
  repositories_added: z.array(installationRepositorySchema).default([]),
  repositories_removed: z.array(installationRepositorySchema.pick({ id: true })).default([]),
});

/** Общие поля событий репозитория: установка и репозиторий, откуда пришло событие. */
export const repositoryEventBase = z.object({
  action: z.string().optional(),
  installation: z.object({ id: githubId }).optional(),
  repository: repositorySchema,
  sender: senderSchema,
});

export type InstallationEvent = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEvent = z.infer<typeof installationRepositoriesEventSchema>;

/** Поля pull_request, общие для событий PR и ревью. */
export const pullRequestSchema = z.object({
  id: githubId,
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable().optional(),
  html_url: z.url(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean().optional(),
  merged: z.boolean().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  updated_at: z.string(),
  head: z.object({ ref: z.string(), sha: z.string() }),
  user: z.object({ id: githubId, login: z.string() }).nullable().optional(),
});

export const pullRequestEventSchema = repositoryEventBase.extend({
  action: z.string(),
  pull_request: pullRequestSchema,
});

export const pullRequestReviewEventSchema = repositoryEventBase.extend({
  action: z.string(),
  review: z.object({
    user: z.object({ id: githubId, login: z.string() }).nullable().optional(),
    state: z.string(),
    submitted_at: z.string().nullable().optional(),
  }),
  pull_request: pullRequestSchema,
});

export const checkSuiteEventSchema = repositoryEventBase.extend({
  action: z.string(),
  check_suite: z.object({
    id: githubId,
    head_sha: z.string(),
    status: z.string().nullable(),
    conclusion: z.string().nullable(),
  }),
});

export type PullRequestPayload = z.infer<typeof pullRequestSchema>;
export type RepositoryPayload = z.infer<typeof repositorySchema>;
export type SenderPayload = z.infer<typeof senderSchema>;

export const pushEventSchema = repositoryEventBase.extend({
  ref: z.string(),
  deleted: z.boolean().default(false),
  commits: z
    .array(
      z.object({
        id: z.string(),
        message: z.string(),
        url: z.url(),
        timestamp: z.string(),
        author: z
          .object({ username: z.string().optional(), name: z.string().optional() })
          .optional(),
      }),
    )
    .default([]),
});

/** `create` / `delete`: ref — имя ветки или тега без `refs/heads/`. */
export const refEventSchema = repositoryEventBase.extend({
  ref: z.string(),
  ref_type: z.string(),
});

export type PushCommitPayload = z.infer<typeof pushEventSchema>['commits'][number];
