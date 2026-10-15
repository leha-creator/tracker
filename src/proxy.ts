import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/** Пути, доступные без входа. */
const PUBLIC_PATHS = ['/login', '/register'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Оптимистичная проверка: только наличие session-cookie, без обращения к БД.
 * Это НЕ авторизация — сервер всегда проверяет сессию через requireUser*() из @/shared/access.
 *
 * Обратный редирект (вошедший пользователь на /login → /) делают сами страницы входа после
 * настоящей проверки сессии: cookie может остаться от истёкшей сессии, и редирект по cookie
 * зациклил бы /login ↔ /.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('returnTo', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // API (включая /api/auth и /api/health), статика и файлы с расширением — мимо proxy.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
};
