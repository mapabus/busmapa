import { google } from 'googleapis';

export default async function handler(req, res) {
  // Dozvoli samo GET zahteve (za cron)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== Departures Sheet Reset Request ===');
  
  // PROVERA VREMENA - reset samo u 3 ujutru
  const now = new Date();
  const belgradTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' }));
  const hour = belgradTime.getHours();

  if (hour !== 2) {
    console.log(`⏭️ Reset skipped - current hour is ${hour}, not 2 AM`);
    return res.status(200).send(`SUCCESS - Reset skipped (hour: ${hour}, waiting for 2 AM)`);
  }

  console.log('✓ Time check passed - proceeding with reset at 2 AM');
  
  try {
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

    const sheetName = 'Polasci';
    console.log(`Resetting sheet: ${sheetName}`);

    // Proveri da li sheet postoji
    let sheetId = null;
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );
      
      if (existingSheet) {
        sheetId = existingSheet.properties.sheetId;
        console.log(`✓ Found sheet "${sheetName}" (ID: ${sheetId})`);
      } else {
        // Ako sheet ne postoji, kreiraj ga
        const addSheetResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                  gridProperties: {
                    rowCount: 10000,
                    columnCount: 10
                  }
                }
              }
            }]
          }
        });
        
        sheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
        console.log(`✓ Created new sheet "${sheetName}" (ID: ${sheetId})`);
      }
    } catch (error) {
      console.error('Error checking/creating sheet:', error.message);
      throw error;
    }

    // Obriši sve podatke
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A1:J`
    });

    console.log(`✓ Cleared all data from sheet "${sheetName}"`);

    // Dodaj header poruku
    const timestamp = new Date().toLocaleString('sr-RS', { 
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'RAW',
      resource: {
        values: [[`Sheet resetovan u ${timestamp}`, '', '', '', '', '', '', '', '', '']]
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
              endColumnIndex: 10
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                textFormat: {
                  italic: true,
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        }]
      }
    });

    console.log('=== Departures Reset Complete ===');

    res.status(200).send(
      `SUCCESS - Departures sheet reset at ${timestamp}`
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const timestamp = new Date().toLocaleString('sr-RS', { 
      timeZone: 'Europe/Belgrade',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    res.status(500).send(
      `ERROR - Reset failed at ${timestamp}: ${error.message}`
    );
  }
}
