import type { DailyCount } from '../../models';

export interface StorageTotalsDto {
  usedBytes: number;
  filesCount: number;
}

export interface ResourceOverviewDto {
  users: { total: number; admins: number; banned: number };
  workspaces: { total: number; archived: number };
  sessions: { active: number; impersonated: number };
  /** Регистрации по дням за SIGNUPS_PERIOD_DAYS (дни без регистраций — нули). */
  signups: DailyCount[];
  signupsTotal: number;
  storage: { documents: StorageTotalsDto; attachments: StorageTotalsDto };
  health: { db: boolean; storage: boolean };
  /** Адрес, на который уйдёт тестовое письмо (свой email администратора). */
  adminEmail: string;
}
