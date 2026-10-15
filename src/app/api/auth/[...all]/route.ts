import { getAuth } from '@/shared/auth';

// getAuth() вызывается на запросе, а не при импорте: `next build` не требует env.
function handle(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };
