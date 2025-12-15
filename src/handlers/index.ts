import { handleSveVozila } from './sve-vozila';
import { handleLinije } from './linije';
import { handleGetSheetData } from './sheet-data';
import { handleAuth } from './auth';

interface Env {
  ANALYTICS?:  AnalyticsEngineDataset;
  BUCKET?: R2Bucket;
  ENVIRONMENT?:  string;
}

export async function handleRequest(
  pathname: string,
  request: Request,
  env: Env
): Promise<Response> {
  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Preflight zahtevi
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (pathname === '/api/sve') {
      return await handleSveVozila(env);
    }

    if (pathname === '/api/linije') {
      return await handleLinije(env);
    }

    if (pathname === '/api/get-sheet-data') {
      return await handleGetSheetData(env);
    }

    if (pathname === '/api/auth') {
      return await handleAuth(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers,
    });
  } catch (error) {
    console.error('Handler Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error. message : 'Unknown error',
      }),
      { status: 500, headers }
    );
  }
}
