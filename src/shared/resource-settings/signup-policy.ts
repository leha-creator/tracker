/** Режим регистрации: открыта, только по приглашению в пространство, закрыта. */
export const SIGNUP_MODES = ['open', 'invite_only', 'closed'] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

export const SIGNUP_MODE_LABELS: Record<SignupMode, string> = {
  open: 'Открыта',
  invite_only: 'Только по приглашению',
  closed: 'Закрыта',
};

/** Почему регистрация отклонена (для логов и сообщения пользователю). */
export type SignupRejection = 'closed' | 'invite_only' | 'domain';

export const SIGNUP_REJECTION_MESSAGES: Record<SignupRejection, string> = {
  closed: 'Регистрация на этом ресурсе закрыта. Обратитесь к администратору.',
  invite_only:
    'Регистрация только по приглашению. Попросите владельца пространства пригласить вас на этот email.',
  domain: 'Регистрация с этим адресом недоступна: разрешены только email рабочих доменов.',
};

/** Домен email в нижнем регистре: `Anna@Example.COM` → `example.com`. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1
    ? ''
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/**
 * Можно ли зарегистрировать этот email. ADMIN_EMAILS регистрируются всегда — иначе закрытая
 * регистрация отрезала бы доступ администраторам. Приглашение снимает и режим «только по
 * приглашению», и ограничение доменов: владелец пространства сам решил позвать этот адрес.
 * Возвращает причину отказа или null.
 */
export function checkSignup(input: {
  email: string;
  mode: SignupMode;
  allowedEmailDomains: readonly string[];
  isAdminEmail: boolean;
  hasPendingInvitation: boolean;
}): SignupRejection | null {
  if (input.isAdminEmail) return null;
  if (input.mode === 'closed') return 'closed';
  if (input.hasPendingInvitation) return null;
  if (input.mode === 'invite_only') return 'invite_only';
  if (input.allowedEmailDomains.length > 0) {
    const domain = emailDomain(input.email);
    if (!input.allowedEmailDomains.includes(domain)) return 'domain';
  }
  return null;
}
