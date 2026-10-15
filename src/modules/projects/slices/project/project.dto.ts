export interface ProjectListItemDto {
  id: string;
  name: string;
  description: string | null;
  statusesCount: number;
  tasksCount: number;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  name: string;
  description: string | null;
  createdAt: Date;
  /** Число задач, размещённых в проекте. */
  tasksCount: number;
}
