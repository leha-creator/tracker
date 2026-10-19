export interface AccountSessionDto {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** Сессия входа «от имени» (имперсонация). */
  impersonated: boolean;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/** Метрики учётных записей для обзора ресурса (без агентов пространств). */
export interface AccountMetricsDto {
  users: { total: number; admins: number; banned: number; unverified: number; twoFactor: number };
  sessions: { active: number; impersonated: number };
  /** Регистрации по дням (UTC) с начала периода; дни без регистраций не приходят. */
  signupsByDay: { day: string; count: number }[];
  failedSignIns: number;
}
