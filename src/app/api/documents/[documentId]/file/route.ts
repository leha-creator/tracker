import type { NextRequest } from 'next/server';

import { getDocumentFile } from '@/modules/documents';
import { getSession } from '@/shared/auth';
import { NotFoundError, toErrorResponse } from '@/shared/errors';
import { createLogger } from '@/shared/logger';

const log = createLogger('api.documents.file');

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function notFound(): Response {
  return new Response('Not Found', { status: 404, headers: NO_STORE });
}

/**
 * Файл документа: проверка доступа → 302 на короткоживущую presigned-ссылку хранилища.
 * `?inline=1` — открыть в браузере (картинки, PDF, медиа; остальное всё равно скачивается).
 * Заметка отдаётся как `.md`. proxy `/api` не трогает, поэтому сессию проверяем здесь; без
 * сессии и без доступа — 404, существование документа не раскрывается.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/documents/[documentId]/file'>,
): Promise<Response> {
  const { documentId } = await ctx.params;
  try {
    const session = await getSession();
    if (!session) {
      log.warn({ documentId }, '[api.documents.file] no session');
      return notFound();
    }

    const inline = request.nextUrl.searchParams.get('inline') === '1';
    const file = await getDocumentFile(session, documentId, { inline });
    log.debug({ documentId, kind: file.kind, inline }, '[api.documents.file]');
    if (file.kind === 'note') {
      return new Response(file.content, {
        status: 200,
        headers: {
          ...NO_STORE,
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': file.contentDisposition,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { ...NO_STORE, Location: file.url, 'Referrer-Policy': 'no-referrer' },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    return toErrorResponse(error, { route: 'GET /api/documents/[documentId]/file', documentId });
  }
}
