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
