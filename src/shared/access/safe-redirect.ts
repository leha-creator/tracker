/**
 * Возвращает путь для редиректа после входа, только если он относительный и внутри приложения.
 * Защита от open redirect: `https://evil.com`, `//evil.com`, `/\evil.com` отбрасываются.
 */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
