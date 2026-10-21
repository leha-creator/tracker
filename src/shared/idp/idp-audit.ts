import { z } from 'zod';

// Схема ответа API журнала IdP (docs/oidc-clients.md «API журнала безопасности»).

const idpAuditEventSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  category: z.string(),
  createdAt: z.coerce.date(),
  actor: z.object({ id: z.string().nullable(), name: z.string() }).nullable(),
  targetUserId: z.string().nullable(),
  impersonatorId: z.string().nullable(),
  text: z.string(),
  details: z.string().nullable(),
  ip: z.string().nullable(),
  device: z.string().nullable(),
});

export type IdpAuditEvent = z.infer<typeof idpAuditEventSchema>;

const idpAuditPageSchema = z.object({
  events: z.array(idpAuditEventSchema),
  nextCursor: z.string().nullable(),
});

export type IdpAuditPage = z.infer<typeof idpAuditPageSchema>;

/** Разбирает страницу журнала IdP; неожиданный формат — ошибка (лента покажется без IdP). */
export function parseIdpAuditPage(body: unknown): IdpAuditPage {
  return idpAuditPageSchema.parse(body);
}
