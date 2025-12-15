interface Env {
  BUCKET?:  R2Bucket;
  ENVIRONMENT?: string;
}

// HTML fajlovi kao stringovi
const staticAssets:  Record<string, string> = {
  'index.html': `<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>mapabus</title>
    <style>
        * { margin: 0; padding:  0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background:  linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container { text-align: center; }
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
            box-shadow:  0 8px 16px rgba(0, 0, 0, 0.2);
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
        <div class="button-container">
            <a href="/api/sve" class="btn">Sva Vozila</a>
            <a href="/api/linije" class="btn">Linije</a>
            <a href="/baza.html" class="btn">Baza Podataka</a>
        </div>
    </div>
</body>
</html>`,

  'baza.html': `<!-- Tvoj baza. html sadržaj ide ovdje -->
<!DOCTYPE html>
<html lang="sr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baza Vozila</title>
    <!-- ...  ostatak HTML-a ... -->
</head>
<body>
    <!-- ... -->
</body>
</html>`,
};

export async function serveStaticAssets(
  filename: string,
  env:  Env
): Promise<Response> {
  try {
    // Prvo provjeri u memoriji
    if (staticAssets[filename]) {
      return new Response(staticAssets[filename], {
        headers: {
          'Content-Type': getContentType(filename),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Ako je dostupan R2 bucket, provjeri tamo
    if (env.BUCKET) {
      try {
        const object = await env.BUCKET.get(`public/${filename}`);
        if (object) {
          return new Response(object.body, {
            headers: {
              'Content-Type': getContentType(filename),
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch (e) {
        console.log(`File not found in bucket: ${filename}`);
      }
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Static asset error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function getContentType(filename:  string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}
