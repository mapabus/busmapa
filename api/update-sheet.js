import { google } from 'googleapis';

export default async function handler(req, res) {
  // Dodaj CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { vehicles } = req.body;

    if (!vehicles || !Array.isArray(vehicles)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // Proveri environment variables
    if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || 
        !process.env.GOOGLE_SHEETS_PRIVATE_KEY || 
        !process.env.GOOGLE_SPREADSHEET_ID) {
      console.error('Missing environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: 'Environment variables not set'
      });
    }

    // Google Sheets autentifikacija
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // Pripremi podatke za upis
    const timestamp = new Date().toLocaleString('sr-RS', { timeZone: 'Europe/Belgrade' });
    const rows = vehicles.map(v => [
      v.vehicleLabel || '',
      v.routeDisplayName || '',
      v.startTime || '',
      v.destName || '',
      timestamp
    ]);

    // Očisti postojeće podatke
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'BazaVozila!A2:E',
    });

    // Upiši nove podatke
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'BazaVozila!A2',
      valueInputOption: 'RAW',
      resource: {
        values: rows,
      },
    });

    // Sortiraj po vozilu (kolona A)
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              sortRange: {
                range: {
                  sheetId: 0,
                  startRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 5,
                },
                sortSpecs: [
                  {
                    dimensionIndex: 0,
                    sortOrder: 'ASCENDING',
                  },
                ],
              },
            },
          ],
        },
      });
    } catch (sortError) {
      console.error('Sort error (non-critical):', sortError.message);
      // Nastavi dalje, sortiranje nije kritično
    }

    res.status(200).json({ 
      success: true, 
      updated: rows.length,
      timestamp 
    });

  } catch (error) {
    console.error('Google Sheets error:', error);
    res.status(500).json({ 
      error: 'Failed to update sheet',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
