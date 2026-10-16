import type { WorkspaceRole } from '@/shared/access/workspace-role';

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  /** Выданное право управлять проектами (у владельца право есть всегда, флаг не важен). */
  canManageProjects: boolean;
  joinedAt: Date;
  isCurrentUser: boolean;
}

/** Пространство, где пользователь — единственный владелец. */
export interface SoleOwnedWorkspaceDto {
  id: string;
  name: string;
  slug: string;
}
