import { getAuth, loadOidcDiscovery } from '@/shared/auth';
import { loadGithubAppConfig } from '@/shared/github-app';

// getAuth() вызывается на запросе, а не при импорте: `next build` не требует env.
// Конфиг GitHub App и доступность IdP — до getAuth(): от них зависят провайдеры входа.
async function handle(request: Request): Promise<Response> {
  await Promise.all([loadGithubAppConfig(), loadOidcDiscovery()]);
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };
