import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== Google Sheets Update Request ===');
  
  try {
    const { vehicles } = req.body;

    if (!vehicles || !Array.isArray(vehicles)) {
      console.error('Invalid data format');
      return res.status(400).json({ error: 'Invalid data format' });
    }

    console.log(`Received ${vehicles.length} vehicles`);

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      return res.status(500).json({ 
        error: 'Missing environment variables'
      });
    }

    let formattedPrivateKey = privateKey;
    if (privateKey.includes('\\n')) {
      formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: formattedPrivateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const now = new Date();
    const timestamp = now.toLocaleString('sr-RS', { 
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const sheetName = 'Baza';
    console.log(`Target sheet: ${sheetName}`);

    // Proveri da li sheet postoji, ako ne - kreiraj ga
    let sheetId = null;
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );
      
      if (existingSheet) {
        sheetId = existingSheet.properties.sheetId;
        console.log(`✓ Sheet "${sheetName}" already exists (ID: ${sheetId})`);
      } else {
        // Kreiraj sheet "Baza" ako ne postoji
        const addSheetResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                  gridProperties: {
                    rowCount: 100000,
                    columnCount: 6,
                    frozenRowCount: 1
                  }
                }
              }
            }]
          }
        });
        
        sheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
        console.log(`✓ Created new sheet "${sheetName}" (ID: ${sheetId})`);
        
        // Dodaj header
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:F1`,
          valueInputOption: 'RAW',
          resource: {
            values: [['Vozilo', 'Linija', 'Polazak', 'Smer', 'Vreme upisa', 'Datum']]
          }
        });
        
        // Formatiraj header
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 6
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.24, blue: 0.45 },
                    textFormat: {
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                      fontSize: 11,
                      bold: true
                    }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }]
          }
        });
      }
    } catch (error) {
      console.error('Error checking/creating sheet:', error.message);
      throw error;
    }

    // Pročitaj postojeće podatke
    let existingData = [];
    try {
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A2:F`,
      });
      existingData = readResponse.data.values || [];
      console.log(`Found ${existingData.length} existing rows in ${sheetName}`);
    } catch (readError) {
      console.log('No existing data:', readError.message);
    }

    // ========================================
    // NOVA LOGIKA: Kompozitni ključ = Vozilo + Polazak
    // ========================================
    const existingTrips = new Map();
    existingData.forEach((row, index) => {
      if (row[0] && row[2]) { // Proveri da postoje Vozilo i Polazak
        const tripKey = `${row[0]}_${row[2]}`; // npr."101_04:00"
        existingTrips.set(tripKey, {
          rowIndex: index + 2, // Row index u Google Sheets (počinje od 2)
          data: row
        });
      }
    });

    console.log(`Mapped ${existingTrips.size} unique trips from existing data`);

    // Obrađuj sva vozila iz API-ja
    const finalData = [...existingData]; // Kopiraj SVE postojeće redove
    let newCount = 0;
    let updateCount = 0;

    vehicles.forEach(v => {
      const vehicleLabel = v.vehicleLabel || '';
      const startTime = v.startTime || '';
      const tripKey = `${vehicleLabel}_${startTime}`; // Jedinstveni ključ polaska
      
      const rowData = [
        vehicleLabel,
        v.routeDisplayName || '',
        startTime,
        v.destName || '',
        timestamp,
        timestamp.split(',')[0].trim()
      ];

      if (existingTrips.has(tripKey)) {
        // Polazak već postoji → AŽURIRAJ samo vreme upisa
        const existingTrip = existingTrips.get(tripKey);
        const arrayIndex = existingTrip.rowIndex - 2;
        finalData[arrayIndex] = rowData;
        updateCount++;
        console.log(`  ↻ Updated: ${tripKey}`);
      } else {
        // Novi polazak → DODAJ kao novi red
        finalData.push(rowData);
        newCount++;
        existingTrips.set(tripKey, { 
          rowIndex: finalData.length + 1, 
          data: rowData 
        });
        console.log(`  ✓ Added new: ${tripKey}`);
      }
    });

    console.log(`Processing: ${updateCount} updates, ${newCount} new departures`);

    // BATCH UPIS
    const BATCH_SIZE = 2500;
    const batches = [];
    
    for (let i = 0; i < finalData.length; i += BATCH_SIZE) {
      batches.push(finalData.slice(i, i + BATCH_SIZE));
    }

    console.log(`Writing ${batches.length} batches to Google Sheets`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const startRow = (batchIndex * BATCH_SIZE) + 2;
      const endRow = startRow + batch.length - 1;

      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A${startRow}:F${endRow}`,
          valueInputOption: 'RAW',
          resource: {
            values: batch
          }
        });
        console.log(`✓ Batch ${batchIndex + 1}/${batches.length} written (rows ${startRow}-${endRow})`);
      } catch (updateError) {
        console.error(`Failed to write batch ${batchIndex + 1}:`, updateError.message);
        throw updateError;
      }

      // Pauza između batch-eva
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Sortiranje po vozilu, pa po polasku
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              sortRange: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 6,
                },
                sortSpecs: [
                  {
                    dimensionIndex: 0, // Prvo po vozilu
                    sortOrder: 'ASCENDING',
                  },
                  {
                    dimensionIndex: 2, // Zatim po polasku
                    sortOrder: 'ASCENDING',
                  }
                ],
              },
            }
          ],
        },
      });
      console.log('✓ Data sorted by vehicle and departure time');
    } catch (sortError) {
      console.warn('Sort error (non-critical):', sortError.message);
    }

    console.log('=== Update Complete ===');

    res.status(200).json({ 
      success: true, 
      newDepartures: newCount,
      updatedDepartures: updateCount,
      totalProcessed: vehicles.length,
      totalRowsInSheet: finalData.length,
      timestamp,
      sheetUsed: sheetName,
      batchesWritten: batches.length
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected error',
      details: error.message
    });
  }
}
