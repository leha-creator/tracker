export interface ProjectListItemDto {
  id: string;
  name: string;
  description: string | null;
  statusesCount: number;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  name: string;
  description: string | null;
  createdAt: Date;
}
