import type { WorkspaceRole } from '@/shared/access/workspace-role';

export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
  isCurrentUser: boolean;
}
