import type { NextRequest } from 'next/server';

import { getAttachmentDownload } from '@/modules/tasks';
import { getSession } from '@/shared/auth';
import { NotFoundError, toErrorResponse } from '@/shared/errors';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: NO_STORE });
}

/**
 * Скачивание вложения: проверка доступа → 302 на короткоживущую presigned-ссылку хранилища.
 * `?inline=1` — открыть картинку в браузере (миниатюры). proxy `/api` не трогает, поэтому сессию
 * проверяем здесь; без сессии и без доступа — 404, существование файла не раскрывается.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/attachments/[attachmentId]'>,
): Promise<Response> {
  const { attachmentId } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) return notFound();

    const inline = request.nextUrl.searchParams.get('inline') === '1';
    const { url } = await getAttachmentDownload(session, attachmentId, { inline });
    return new Response(null, {
      status: 302,
      headers: { ...NO_STORE, Location: url, 'Referrer-Policy': 'no-referrer' },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    return toErrorResponse(error, { route: 'GET /api/attachments/[attachmentId]', attachmentId });
  }
}
