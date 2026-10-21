import { z } from 'zod';

// Чистые части протокола IdP plwedding ID (API журнала и Admin API): заголовок клиента,
// формат ошибок. Контракт — docs/oidc-clients.md и docs/admin-api.md в leha-creator/auth.

/** Коды ошибок API IdP: `{ error: { code, message } }`. */
export type IdpErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UNAVAILABLE';

const ERROR_CODES = new Set<string>([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

/** Ответ IdP с ошибкой или сбой связи (`status: 0`, код `UNAVAILABLE`). */
export class IdpApiError extends Error {
  readonly status: number;
  readonly code: IdpErrorCode;
  /** Секунды до повтора (`Retry-After` у 429). */
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    status: number;
    code: IdpErrorCode;
    message: string;
    retryAfterSeconds?: number | null;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'IdpApiError';
    this.status = input.status;
    this.code = input.code;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

/** Часть Basic-заголовка: `application/x-www-form-urlencoded` (RFC 6749, 2.3.1). */
function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/** `Basic base64(client_id:client_secret)` — как на token endpoint IdP. */
export function idpBasicAuthorization(clientId: string, clientSecret: string): string {
  const raw = `${formEncode(clientId)}:${formEncode(clientSecret)}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

function codeFromStatus(status: number): IdpErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

/** Ошибка из ответа IdP: код и сообщение из тела, иначе — по статусу. */
export function parseIdpError(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): IdpApiError {
  const parsed = errorBodySchema.safeParse(body);
  const code =
    parsed.success && ERROR_CODES.has(parsed.data.error.code)
      ? (parsed.data.error.code as IdpErrorCode)
      : codeFromStatus(status);
  const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;
  return new IdpApiError({
    status,
    code,
    message: parsed.success ? parsed.data.error.message : `IdP responded with HTTP ${status}`,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}
