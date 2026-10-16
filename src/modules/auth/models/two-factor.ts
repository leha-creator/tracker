/** Число цифр кода из приложения-аутентификатора (TOTP по умолчанию Better Auth). */
export const TOTP_CODE_LENGTH = 6;

/** Данные из `otpauth://totp/...` для ручного ввода в приложение. */
export interface TotpUriParts {
  secret: string;
  issuer: string | null;
  account: string | null;
}

/** Разбирает URI для QR-кода. null — строка не похожа на `otpauth://totp/` или без секрета. */
export function parseTotpUri(uri: string): TotpUriParts | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') return null;
  const secret = url.searchParams.get('secret');
  if (!secret) return null;

  const label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const separator = label.indexOf(':');
  return {
    secret,
    issuer: url.searchParams.get('issuer') ?? (separator > 0 ? label.slice(0, separator) : null),
    account: (separator >= 0 ? label.slice(separator + 1) : label) || null,
  };
}

/** Секрет группами по 4 символа — так его проще перепечатать. */
export function formatTotpSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Код из поля ввода: без пробелов и дефисов (приложения показывают «123 456»). */
export function normalizeTotpCode(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** Текст файла с резервными кодами для скачивания. */
export function formatBackupCodesFile(codes: string[], email: string, createdAt: Date): string {
  return [
    'Tasker — резервные коды двухфакторной аутентификации',
    `Аккаунт: ${email}`,
    `Созданы: ${createdAt.toISOString().slice(0, 10)}`,
    '',
    'Каждый код можно использовать один раз, если нет доступа к приложению-аутентификатору.',
    'Храните коды в надёжном месте. Новые коды отменяют эти.',
    '',
    ...codes,
    '',
  ].join('\n');
}
