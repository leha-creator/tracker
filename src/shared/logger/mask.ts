/** Маскирует email для логов: `john.doe@example.com` → `j***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
