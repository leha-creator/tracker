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
  /** Выданное право управлять документами (у владельца — всегда). */
  canManageDocuments: boolean;
  joinedAt: Date;
  isCurrentUser: boolean;
}

/** Участник пространства по userId — для публичного профиля и карточки при наведении. */
export interface WorkspaceMemberDto {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  /** Право управлять проектами: у владельца — всегда. */
  canManageProjects: boolean;
  /** Выданное право управлять документами (у владельца — всегда). */
  canManageDocuments: boolean;
  joinedAt: Date;
  registeredAt: Date;
  isCurrentUser: boolean;
}

/** Имя и email участника — кандидат для @упоминания. */
export interface MemberIdentityDto {
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

/** Пространство, где пользователь — единственный владелец. */
export interface SoleOwnedWorkspaceDto {
  id: string;
  name: string;
  slug: string;
}
