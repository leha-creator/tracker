import type { AuditCategory } from '@/shared/audit/client';

/** Событие журнала для ленты: готовый текст, ссылка и участники. */
export interface AuditEventDto {
  id: string;
  kind: string;
  category: AuditCategory;
  text: string;
  /** Подробности (причина блокировки, изменённые настройки) — только администратору. */
  details: string | null;
  href: string | null;
  /** null — система или неизвестный автор (например, неудачный вход). */
  actor: { id: string | null; name: string; image: string | null; isAgent: boolean } | null;
  /** Администратор, действовавший от имени автора. */
  impersonator: { id: string; name: string } | null;
  /** Название токена MCP, через который действовали; null — не через токен. */
  viaTokenName: string | null;
  workspace: { id: string; slug: string; name: string } | null;
  /** IP и устройство — только в своём журнале и у администратора. */
  ip: string | null;
  device: string | null;
  createdAt: Date;
}

export interface AuditEventPageDto {
  items: AuditEventDto[];
  /** Курсор следующей страницы; null — событий больше нет. */
  nextCursor: string | null;
  /** IdP не ответил: лента показана без событий учётной записи. */
  identityUnavailable?: boolean;
}
