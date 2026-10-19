import type { ApiTokenDto } from '@/modules/api-tokens/client';
import type { UserMembershipDto } from '@/modules/workspaces/client';
import type { GlobalRole } from '@/shared/access/global-role';

export type AdminUserBanDto =
  | { kind: 'active' }
  | {
      kind: 'banned';
      /** null — бессрочно. */
      until: Date | null;
      reason: string | null;
    };

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: GlobalRole;
  ban: AdminUserBanDto;
  workspacesCount: number;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  isCurrentUser: boolean;
}

export interface AdminUserListDto {
  items: AdminUserDto[];
  total: number;
  /** Текущая страница с 1. */
  page: number;
  /** Число страниц; 0 — пользователей нет. */
  pageCount: number;
}

/** Сессия пользователя в карточке админки: без токена. */
export interface AdminUserSessionDto {
  id: string;
  /** «Chrome · Windows» или «Неизвестное устройство». */
  deviceLabel: string;
  ipAddress: string | null;
  /** Сессия администратора, вошедшего от имени пользователя. */
  impersonated: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/** Карточка пользователя в админке. Пространства и токены — DTO модулей workspaces и api-tokens. */
export interface AdminUserDetailDto {
  user: AdminUserDto & {
    position: string | null;
    bio: string | null;
    updatedAt: Date;
    /** Привязанный GitHub-аккаунт (id GitHub) или null. */
    github: { githubId: string } | null;
  };
  memberships: UserMembershipDto[];
  sessions: AdminUserSessionDto[];
  tokens: ApiTokenDto[];
}
