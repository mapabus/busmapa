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

    // Timestamp
    const timestamp = new Date().toLocaleString('sr-RS', { 
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const sheetName = 'Sheet1';

    // Helper funkcija za retry logiku
    async function retryOperation(operation, maxRetries = 3) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await operation();
        } catch (error) {
          console.log(`Attempt ${i + 1} failed:`, error.message);
          if (i === maxRetries - 1) throw error;
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 500));
        }
      }
    }

    // Prvo pročitaj postojeće podatke SA RETRY-em
    let existingData = [];
    try {
      existingData = await retryOperation(async () => {
        const readResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A2:F`,
        });
        return readResponse.data.values || [];
      });
      console.log(`Found ${existingData.length} existing rows`);
    } catch (readError) {
      console.error('Failed to read existing data after retries:', readError.message);
      // Nastavi dalje čak i ako read failuje
    }

    // Kreiraj mapu postojećih vozila
    const existingVehicles = new Map();
    existingData.forEach((row, index) => {
      if (row[0]) {
        existingVehicles.set(row[0], {
          rowIndex: index + 2,
          data: row
        });
      }
    });

    let newCount = 0;
    let updateCount = 0;
    const errors = [];

    // Grupiši operacije - prvo UPDATE, pa tek onda APPEND
    const toUpdate = [];
    const toAppend = [];

    vehicles.forEach(v => {
      const vehicleLabel = v.vehicleLabel || '';
      const rowData = [
        vehicleLabel,
        v.routeDisplayName || '',
        v.startTime || '',
        v.destName || '',
        timestamp,
        timestamp.split(',')[0].trim()
      ];

      if (existingVehicles.has(vehicleLabel)) {
        toUpdate.push({
          label: vehicleLabel,
          rowIndex: existingVehicles.get(vehicleLabel).rowIndex,
          data: rowData
        });
      } else {
        toAppend.push({
          label: vehicleLabel,
          data: rowData
        });
      }
    });

    console.log(`Operations planned: ${toUpdate.length} updates, ${toAppend.length} new`);

    // Izvrši UPDATE operacije
    for (const item of toUpdate) {
      try {
        await retryOperation(async () => {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A${item.rowIndex}:F${item.rowIndex}`,
            valueInputOption: 'RAW',
            resource: {
              values: [item.data]
            }
          });
        });
        updateCount++;
        console.log(`✓ Updated ${item.label} at row ${item.rowIndex}`);
      } catch (updateError) {
        errors.push(`Update failed for ${item.label}: ${updateError.message}`);
        console.error(`✗ Update error for ${item.label}:`, updateError.message);
      }
    }

    // Pauza između operacija
    if (toUpdate.length > 0 && toAppend.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Izvrši APPEND operacije - SVA VOZILA ODJEDNOM u BATCH-u
    if (toAppend.length > 0) {
      try {
        await retryOperation(async () => {
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
              values: toAppend.map(item => item.data) // SVE odjednom!
            }
          });
        });
        newCount = toAppend.length;
        console.log(`✓ Added ${newCount} new vehicles in batch`);
      } catch (appendError) {
        errors.push(`Batch append failed: ${appendError.message}`);
        console.error(`✗ Batch append error:`, appendError.message);
        
        // Fallback: pokušaj pojedinačno
        console.log('Trying individual append as fallback...');
        for (const item of toAppend) {
          try {
            await retryOperation(async () => {
              await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A2`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                  values: [item.data]
                }
              });
            });
            newCount++;
            console.log(`✓ Added ${item.label} individually`);
            // Mali delay između pojedinačnih append-ova
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (individualError) {
            errors.push(`Individual append failed for ${item.label}: ${individualError.message}`);
            console.error(`✗ Failed to add ${item.label}:`, individualError.message);
          }
        }
      }
    }

    // Sortiranje - SAMO ako je bilo novih vozila
    if (newCount > 0) {
      // Pauza pre sortiranja
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        await retryOperation(async () => {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
              requests: [{
                sortRange: {
                  range: {
                    sheetId: 0,
                    startRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 6,
                  },
                  sortSpecs: [{
                    dimensionIndex: 0,
                    sortOrder: 'ASCENDING',
                  }],
                },
              }],
            },
          });
        });
        console.log('✓ Data sorted successfully');
      } catch (sortError) {
        errors.push(`Sort failed: ${sortError.message}`);
        console.warn('✗ Sort error (non-critical):', sortError.message);
      }
    }

    console.log('=== Update Complete ===');

    const response = { 
      success: true, 
      newVehicles: newCount,
      updatedVehicles: updateCount,
      totalProcessed: vehicles.length,
      timestamp,
      sheetUsed: sheetName
    };

    if (errors.length > 0) {
      response.warnings = errors;
      response.partialSuccess = true;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected error',
      details: error.message
    });
  }
          }
