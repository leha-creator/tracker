import type { WorkspaceRole } from '@/shared/access/workspace-role';
import type { EntityIcon } from '@/shared/entity-icon';

/** Запрос списка всех пространств ресурса (разбирает и проверяет модуль admin). */
export interface AllWorkspacesQuery {
  /** Поиск по названию, адресу и ключу задач; пусто — без поиска. */
  q: string;
  /** null — все. */
  archived: 'active' | 'archived' | null;
  sort: 'name' | 'created';
  dir: 'asc' | 'desc';
  /** С 1. */
  page: number;
  pageSize: number;
}

export interface WorkspaceOwnerDto {
  userId: string;
  name: string;
  email: string;
}

/** Строка списка пространств в админке. */
export interface AdminWorkspaceRowDto {
  id: string;
  slug: string;
  name: string;
  icon: EntityIcon;
  taskKey: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  /** Своя квота документов, МБ; null — по умолчанию. */
  storageQuotaMb: number | null;
  owners: WorkspaceOwnerDto[];
  /** Участники-люди, без агентов. */
  membersCount: number;
  agentsCount: number;
  /** Проекты и задачи вне архива. */
  projectsCount: number;
  tasksCount: number;
}

export interface AllWorkspacesDto {
  items: AdminWorkspaceRowDto[];
  total: number;
}

/** Участник пространства в карточке админки. */
export interface AdminWorkspaceMemberDto {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  isAgent: boolean;
  joinedAt: Date;
}

export interface AdminWorkspaceDto extends AdminWorkspaceRowDto {
  members: AdminWorkspaceMemberDto[];
}

/** Итог смены владельца — для журнала. */
export interface OwnershipTransferResultDto {
  workspaceName: string;
  ownerName: string;
  /** Сколько прежних владельцев стали участниками. */
  demotedCount: number;
}
