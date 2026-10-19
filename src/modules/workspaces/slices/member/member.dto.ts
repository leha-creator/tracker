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
  /** Агент пространства: им управляют в разделе «Агенты», а не в списке участников. */
  isAgent: boolean;
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
  isAgent: boolean;
  /** Ответственный агента; у человека и агента без ответственного — null. */
  responsible: { userId: string; name: string } | null;
}

/** Имя и email участника — кандидат для @упоминания. */
export interface MemberIdentityDto {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  /** Агент — в списках выбора с подписью «(агент)». */
  isAgent: boolean;
}

/** Членство пользователя в пространстве — для карточки пользователя в админке. */
export interface UserMembershipDto {
  workspace: { id: string; slug: string; name: string; archived: boolean };
  role: WorkspaceRole;
  canManageProjects: boolean;
  canManageDocuments: boolean;
  joinedAt: Date;
}

/** Пространство, где пользователь — единственный владелец. */
export interface SoleOwnedWorkspaceDto {
  id: string;
  name: string;
  slug: string;
}
