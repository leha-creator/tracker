import type { SignupMode } from '@/shared/resource-settings/client';

export interface AdminSignupPolicyDto {
  signupMode: SignupMode;
  allowedEmailDomains: string[];
}

export interface AdminStorageSettingsDto {
  /** null — квота из окружения (`envQuotaMb`). */
  defaultWorkspaceQuotaMb: number | null;
  envQuotaMb: number;
}

export interface AdminResourceSettingsDto {
  signup: AdminSignupPolicyDto;
  storage: AdminStorageSettingsDto;
  updatedAt: Date | null;
  updatedBy: { id: string; name: string } | null;
}
