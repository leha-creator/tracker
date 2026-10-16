import type { ApiTokenState } from '../../models/api-token';

/** Токен в списке профиля: без хеша и без самого токена. */
export interface ApiTokenDto {
  id: string;
  name: string;
  /** `tkr_abcd1234` — начало токена. */
  prefix: string;
  workspace: { id: string; slug: string; name: string };
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  state: ApiTokenState;
}

/** Результат выпуска: открытый токен показывается один раз. */
export interface CreatedApiTokenDto {
  token: ApiTokenDto;
  secret: string;
}
