interface Env {
  ANALYTICS?: AnalyticsEngineDataset;
  BUCKET?: R2Bucket;
  ENVIRONMENT?: string;
}

interface Vehicle {
  vozilo: string;
  linija: string;
  polazak: string;
  smer: string;
  lat?:  number;
  lon?: number;
  timestamp?:  string;
}

export async function handleSveVozila(env: Env): Promise<Response> {
  try {
    // Čitaj podatke iz R2 buckets
    let vehicles: Vehicle[] = [];

    if (env.BUCKET) {
      try {
        const object = await env.BUCKET.get('vehicles-data. json');
        if (object) {
          const text = await object.text();
          vehicles = JSON.parse(text);
        }
      } catch (e) {
        console.log('No cached data found');
      }
    }

    // Ako nema podataka u cache-u, vrati praznu listu
    if (vehicles.length === 0) {
      vehicles = await fetchVehiclesFromGoogle(env);
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: vehicles.length,
        vehicles: vehicles,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=60',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Sve vozila error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch vehicles' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function fetchVehiclesFromGoogle(env: Env): Promise<Vehicle[]> {
  // Implementacija za Google Sheets API
  // TODO: Dodaj Google Sheets integraciju sa environment varijablama
  const GOOGLE_SHEET_ID = await getEnvVar(env, 'GOOGLE_SHEET_ID');
  const GOOGLE_API_KEY = await getEnvVar(env, 'GOOGLE_API_KEY');

  if (!GOOGLE_SHEET_ID || !GOOGLE_API_KEY) {
    console.warn('Google Sheets credentials not configured');
    return [];
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Sheet1?key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = (await response.json()) as { values: string[][] };

    if (!data.values) return [];

    // Pretvori redove u objekte
    const headers = data.values[0];
    return data.values.slice(1).map((row) => ({
      vozilo: row[0] || '',
      linija: row[1] || '',
      polazak: row[2] || '',
      smer: row[3] || '',
      lat:  parseFloat(row[4]) || undefined,
      lon: parseFloat(row[5]) || undefined,
      timestamp: row[6] || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    return [];
  }
}

async function getEnvVar(env: Env, key: string): Promise<string | undefined> {
  // Za development koristi .wrangler.toml vars
  // Za production koristi Cloudflare Workers Secrets
  return undefined; // Placeholder
}
