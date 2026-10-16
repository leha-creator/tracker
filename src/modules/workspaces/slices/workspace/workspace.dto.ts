import type { WorkspaceRole } from '@/shared/access/workspace-role';
import type { EntityIcon } from '@/shared/entity-icon';

export interface WorkspaceListItemDto {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
  icon: EntityIcon;
  membersCount: number;
}

export interface WorkspaceSummaryDto {
  id: string;
  slug: string;
  name: string;
}

/** Пространство, найденное по ключу задач (системное чтение для интеграций). */
export interface WorkspaceTaskKeyDto {
  id: string;
  slug: string;
  name: string;
  taskKey: string;
}
