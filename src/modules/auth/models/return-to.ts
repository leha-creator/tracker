/**
 * Добавляет к пути параметр returnTo. `returnTo` должен быть уже проверен safeRedirectPath:
 * здесь он только кодируется. Для «/» параметр не нужен.
 */
export function withReturnTo(path: string, returnTo: string): string {
  if (returnTo === '/') return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
