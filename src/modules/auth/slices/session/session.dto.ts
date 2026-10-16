/** Сессия пользователя для списка в профиле. Токена сессии здесь нет. */
export interface MySessionDto {
  id: string;
  /** Сессия, из которой открыта страница. */
  current: boolean;
  /** «Chrome · Windows» или «Неизвестное устройство». */
  deviceLabel: string;
  ipAddress: string | null;
  /** Вход администратора от имени пользователя (impersonation). */
  impersonated: boolean;
  createdAt: Date;
  /** Последнее продление сессии (Better Auth обновляет его не чаще раза в сутки). */
  updatedAt: Date;
}
