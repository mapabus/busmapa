interface LineInfo {
  broj: string;
  naziv?:  string;
  vozila: number;
}

export async function handleLinije(env: any): Promise<Response> {
  try {
    // Čitaj sve podatke o vozilima
    let vehicles = [];

    if (env.BUCKET) {
      const object = await env.BUCKET. get('vehicles-data.json');
      if (object) {
        const text = await object.text();
        vehicles = JSON.parse(text);
      }
    }

    // Grupiraj po linijama
    const lines = new Map<string, LineInfo>();

    vehicles.forEach((vehicle: any) => {
      const linija = vehicle.linija;
      if (!lines.has(linija)) {
        lines.set(linija, {
          broj: linija,
          vozila: 0,
        });
      }
      const line = lines.get(linija)!;
      line.vozila++;
    });

    const sortedLines = Array.from(lines.values()).sort((a, b) => {
      const numA = parseInt(a.broj. replace(/\D/g, '')) || 0;
      const numB = parseInt(b.broj. replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: sortedLines.length,
        lines: sortedLines,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Linije error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch lines' }),
      { status: 500, headers:  { 'Content-Type': 'application/json' } }
    );
  }
}
