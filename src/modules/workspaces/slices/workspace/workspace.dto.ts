import type { WorkspaceRole } from '@/shared/access/workspace-role';

export interface WorkspaceListItemDto {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
  membersCount: number;
}

export interface WorkspaceSummaryDto {
  id: string;
  slug: string;
  name: string;
}
