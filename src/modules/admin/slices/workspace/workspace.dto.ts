import type { StorageUsageDto } from '@/modules/documents/client';
import type { AdminWorkspaceDto, AdminWorkspaceRowDto } from '@/modules/workspaces/client';

export interface AdminWorkspaceListItemDto extends AdminWorkspaceRowDto {
  storage: StorageUsageDto;
}

export interface AdminWorkspaceListDto {
  items: AdminWorkspaceListItemDto[];
  total: number;
  /** Текущая страница с 1. */
  page: number;
  /** Число страниц; 0 — пространств нет. */
  pageCount: number;
}

export interface AdminWorkspaceDetailDto extends AdminWorkspaceDto {
  storage: StorageUsageDto;
}
