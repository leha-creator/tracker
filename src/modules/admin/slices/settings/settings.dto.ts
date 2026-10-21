export interface AdminStorageSettingsDto {
  /** null — квота из окружения (`envQuotaMb`). */
  defaultWorkspaceQuotaMb: number | null;
  envQuotaMb: number;
}

export interface AdminResourceSettingsDto {
  storage: AdminStorageSettingsDto;
  updatedAt: Date | null;
  updatedBy: { id: string; name: string } | null;
}
