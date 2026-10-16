import { getAuth } from '@/shared/auth';
import { loadGithubAppConfig } from '@/shared/github-app';

// getAuth() вызывается на запросе, а не при импорте: `next build` не требует env.
// Конфиг GitHub App — до getAuth(): от него зависит провайдер входа через GitHub.
async function handle(request: Request): Promise<Response> {
  await loadGithubAppConfig();
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };
