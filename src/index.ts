interface Env {
  ANALYTICS?:  AnalyticsEngineDataset;
  BUCKET?:  R2Bucket;
  ENVIRONMENT?: string;
}

export default {
  async fetch(request: Request, env:  Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Rute API-ja
      if (pathname. startsWith('/api/')) {
        return await handleApiRequest(pathname, request, env);
      }

      // Statični fajlovi
      if (pathname === '/' || pathname === '/index.html') {
        return serveIndexHtml();
      }

      if (pathname === '/baza. html' || pathname === '/public/baza.html') {
        return serveBazaHtml();
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response('Internal Server Error', { status:  500 });
    }
  },
};

async function handleApiRequest(
  pathname: string,
  request: Request,
  env:  Env
): Promise<Response> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (pathname === '/api/sve') {
      return handleSveVozila(env, headers);
    }

    if (pathname === '/api/linije') {
      return handleLinije(env, headers);
    }

    if (pathname === '/api/get-sheet-data') {
      return handleGetSheetData(env, headers);
    }

    if (pathname === '/api/auth') {
      return handleAuth(request, env, headers);
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
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers }
    );
  }
}

function handleSveVozila(env:  Env, headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Sve vozila endpoint',
      timestamp: new Date().toISOString(),
    }),
    { headers }
  );
}

function handleLinije(env: Env, headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Linije endpoint',
      timestamp: new Date().toISOString(),
    }),
    { headers }
  );
}

function handleGetSheetData(env: Env, headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      vehicles: [],
      timestamp: new Date().toISOString(),
    }),
    { headers }
  );
}

function handleAuth(
  request: Request,
  env: Env,
  headers:  Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Auth endpoint',
    }),
    { headers }
  );
}

function serveIndexHtml(): Response {
  const html = `<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>mapabus</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background:  linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            text-align: center;
        }

        h1 {
            color: white;
            font-size: 2.5em;
            margin-bottom: 50px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .button-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            align-items: center;
        }

        . btn {
            display: inline-block;
            padding: 20px 50px;
            background: white;
            color: #667eea;
            text-decoration: none;
            font-size: 1.3em;
            font-weight: 600;
            border-radius:  12px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            min-width: 250px;
        }

        . btn:hover {
            transform: translateY(-3px);
            box-shadow:  0 12px 24px rgba(0, 0, 0, 0.3);
            background: #f8f9ff;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚌 MapaBus</h1>
        <div class="button-container">
            <a href="/api/sve" class="btn">Sva Vozila</a>
            <a href="/api/linije" class="btn">Linije</a>
            <a href="/baza.html" class="btn">Baza Podataka</a>
        </div>
    </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function serveBazaHtml(): Response {
  const html = `<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baza Vozila - Dashboard</title>
    <style>
        * {
            margin:  0;
            padding: 0;
            box-sizing:  border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background:  linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: white;
            padding: 25px;
            border-radius:  12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        h1 {
            color: #333;
            font-size: 28px;
        }

        .table-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        thead {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        th {
            padding: 15px;
            text-align:  left;
            font-weight: 600;
        }

        td {
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚌 Baza Vozila</h1>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Vozilo</th>
                        <th>Linija</th>
                        <th>Polazak</th>
                        <th>Smer</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="4" style="text-align: center; color: #999;">Nema podataka</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
