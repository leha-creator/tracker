import { connection } from 'next/server';

import { toErrorResponse } from '@/shared/errors';
import { checkHealth } from '@/shared/health';

/** Состояние инфраструктуры: 200 — всё доступно, 503 — БД или хранилище недоступны. */
export async function GET(): Promise<Response> {
  // Всегда выполнять на запрос: без пререндера на этапе сборки.
  await connection();
  try {
    const report = await checkHealth();
    return Response.json(report, {
      status: report.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return toErrorResponse(error, { route: 'GET /api/health' });
  }
}
