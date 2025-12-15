interface SheetVehicle {
  vozilo: string;
  linija: string;
  polazak: string;
  smer: string;
  timestamp: string;
}

export async function handleGetSheetData(env: any): Promise<Response> {
  try {
    // Prvo pokušaj iz R2 cache-a
    let vehicles: SheetVehicle[] = [];
    let cacheHit = false;

    if (env.BUCKET) {
      try {
        const cached = await env.BUCKET.get('sheet-cache.json');
        if (cached) {
          const text = await cached.text();
          const cacheData = JSON.parse(text);

          // Provjeri validnost cache-a (maks 5 minuta)
          if (
            cacheData.timestamp &&
            Date.now() - new Date(cacheData.timestamp).getTime() < 5 * 60 * 1000
          ) {
            vehicles = cacheData.vehicles;
            cacheHit = true;
          }
        }
      } catch (e) {
        console.log('Cache miss');
      }
    }

    // Ako nema validnog cache-a, uzmi iz Google Sheets
    if (! cacheHit) {
      vehicles = await fetchFromGoogleSheets(env);

      // Cacheuj podatke
      if (env.BUCKET && vehicles.length > 0) {
        await env.BUCKET.put(
          'sheet-cache.json',
          JSON.stringify({
            vehicles:  vehicles,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        vehicles: vehicles,
        cached: cacheHit,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=60, s-maxage=300',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Sheet data error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error fetching sheet data',
        error: error instanceof Error ? error. message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function fetchFromGoogleSheets(env: any): Promise<SheetVehicle[]> {
  // Trebaju ti Google Sheets kredencijali
  const GOOGLE_SHEET_ID = 'YOUR_SHEET_ID'; // Dodaj kao secret
  const GOOGLE_API_KEY = 'YOUR_API_KEY'; // Dodaj kao secret

  try {
    const sheetRange = 'Sheet1!A: E'; // Prilagodi prema tvojim kolonama
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${sheetRange}? key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = (await response.json()) as { values: string[][] };

    if (!data.values || data.values.length < 2) {
      return [];
    }

    // Preskoči header red
    return data.values.slice(1).map((row) => ({
      vozilo: row[0] || '',
      linija: row[1] || '',
      polazak: row[2] || '',
      smer: row[3] || '',
      timestamp: row[4] || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Google Sheets API error:', error);
    return [];
  }
}
