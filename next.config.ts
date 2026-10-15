import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Минимальный сервер `.next/standalone/server.js` для Docker-образа (см. Dockerfile).
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
  // pino использует worker threads и динамические require — не бандлим.
  serverExternalPackages: ['pino', 'pino-pretty'],
  redirects() {
    return Promise.resolve([
      // Корень проекта открывает доску. Ограничение UUID не задевает /projects/new.
      {
        source: '/w/:workspaceSlug/projects/:projectId([0-9a-fA-F-]{36})',
        destination: '/w/:workspaceSlug/projects/:projectId/board',
        permanent: false,
      },
    ]);
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
