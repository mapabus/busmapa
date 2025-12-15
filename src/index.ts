import { handleRequest } from './handlers';
import { Router } from './router';
import { serveStaticAssets } from './static-handler';

interface Env {
  ANALYTICS?:  AnalyticsEngineDataset;
  BUCKET?: R2Bucket;
  ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx:  ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Log zahteva
      if (env.ANALYTICS) {
        ctx.waitUntil(
          env. ANALYTICS.writeDataPoint({
            indexes: [pathname, request.method],
            blobs: [request.headers.get('user-agent') || 'unknown'],
            doubles: [Date.now()],
          })
        );
      }

      // Rute API-ja
      if (pathname. startsWith('/api/')) {
        return await handleRequest(pathname, request, env);
      }

      // Statični fajlovi
      if (pathname === '/' || pathname === '/index.html') {
        return await serveStaticAssets('index.html', env);
      }

      if (pathname === '/baza. html' || pathname === '/public/baza.html') {
        return await serveStaticAssets('baza.html', env);
      }

      if (pathname.startsWith('/public/')) {
        const filename = pathname.replace('/public/', '');
        return await serveStaticAssets(filename, env);
      }

      // 404
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response('Internal Server Error', { status:  500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron jobovi za refresh podataka
    ctx.waitUntil(handleScheduledEvent(event, env));
  },
};

async function handleScheduledEvent(event: ScheduledEvent, env:  Env) {
  console.log('Scheduled event triggered at', new Date().toISOString());
  // Dodaj logiku za auto-refresh
}
