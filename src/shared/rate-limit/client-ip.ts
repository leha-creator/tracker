/**
 * IP клиента из заголовков запроса: первый адрес `X-Forwarded-For`, затем `X-Real-IP`.
 *
 * Доверять заголовку можно только за прокси, который его перезаписывает: edge-Caddy
 * (`reverse_proxy` без `trusted_proxies`) ставит в `X-Forwarded-For` адрес клиента и отбрасывает
 * пришедшее значение. Без такого прокси заголовок подделывается (см. docs/configuration.md).
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  return realIp ? realIp : null;
}
