import type { LinkedDocumentDto } from '@/modules/documents/client';
import type { TaskSearchResultDto } from '@/modules/tasks/client';
import type { EntityIcon } from '@/shared/entity-icon';

export interface MemberSearchResultDto {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  isAgent: boolean;
}

export interface WorkspaceSearchResultDto {
  id: string;
  slug: string;
  name: string;
  icon: EntityIcon;
}

/**
 * Результаты палитры Cmd+K. В пространстве — задачи, документы и участники этого пространства;
 * вне пространства — только пространства пользователя.
 */
export interface GlobalSearchResultDto {
  tasks: TaskSearchResultDto[];
  documents: LinkedDocumentDto[];
  members: MemberSearchResultDto[];
  workspaces: WorkspaceSearchResultDto[];
}
