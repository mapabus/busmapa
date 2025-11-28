import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const debugInfo = {
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    // STEP 1: Proveri environment variables
    debugInfo.steps.push({
      step: 1,
      name: 'Check Environment Variables',
      clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ? '✓ Exists' : '✗ Missing',
      privateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY ? '✓ Exists' : '✗ Missing',
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ? '✓ Exists' : '✗ Missing',
      values: {
        clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || 'NOT SET',
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || 'NOT SET',
        privateKeyLength: process.env.GOOGLE_SHEETS_PRIVATE_KEY ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.length : 0,
        privateKeyStart: process.env.GOOGLE_SHEETS_PRIVATE_KEY ? process.env.GOOGLE_SHEETS_PRIVATE_KEY.substring(0, 50) + '...' : 'NOT SET'
      }
    });

    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      debugInfo.steps.push({
        step: 2,
        name: 'Missing Variables',
        status: '✗ Cannot proceed - missing environment variables'
      });
      return res.status(200).json(debugInfo);
    }

    // STEP 2: Format private key
    let formattedPrivateKey = privateKey;
    if (privateKey.includes('\\n')) {
      formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    }

    debugInfo.steps.push({
      step: 2,
      name: 'Private Key Format',
      hasBeginMarker: formattedPrivateKey.includes('BEGIN PRIVATE KEY') ? '✓' : '✗',
      hasEndMarker: formattedPrivateKey.includes('END PRIVATE KEY') ? '✓' : '✗',
      lineCount: formattedPrivateKey.split('\n').length
    });

    // STEP 3: Create auth
    let auth;
    try {
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: formattedPrivateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      debugInfo.steps.push({
        step: 3,
        name: 'Create Auth Object',
        status: '✓ Success'
      });
    } catch (authError) {
      debugInfo.steps.push({
        step: 3,
        name: 'Create Auth Object',
        status: '✗ Failed',
        error: authError.message
      });
      return res.status(200).json(debugInfo);
    }

    // STEP 4: Get spreadsheet metadata
    const sheets = google.sheets({ version: 'v4', auth });
    
    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });

      debugInfo.steps.push({
        step: 4,
        name: 'Get Spreadsheet Metadata',
        status: '✓ Success',
        title: spreadsheet.data.properties.title,
        sheetCount: spreadsheet.data.sheets.length,
        sheets: spreadsheet.data.sheets.map(sheet => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
          index: sheet.properties.index,
          gridProperties: {
            rowCount: sheet.properties.gridProperties.rowCount,
            columnCount: sheet.properties.gridProperties.columnCount
          }
        }))
      });

      // STEP 5: Check if "BazaVozila" exists
      const bazaVozilaSheet = spreadsheet.data.sheets.find(
        sheet => sheet.properties.title === 'BazaVozila'
      );

      if (bazaVozilaSheet) {
        debugInfo.steps.push({
          step: 5,
          name: 'Find "BazaVozila" Sheet',
          status: '✓ Found',
          sheetId: bazaVozilaSheet.properties.sheetId,
          dimensions: {
            rows: bazaVozilaSheet.properties.gridProperties.rowCount,
            columns: bazaVozilaSheet.properties.gridProperties.columnCount
          }
        });

        // STEP 6: Try to read from BazaVozila
        try {
          const readResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'BazaVozila!A1:E10'
          });

          debugInfo.steps.push({
            step: 6,
            name: 'Read from BazaVozila',
            status: '✓ Success',
            rowsRead: readResponse.data.values ? readResponse.data.values.length : 0,
            firstRow: readResponse.data.values ? readResponse.data.values[0] : null
          });
        } catch (readError) {
          debugInfo.steps.push({
            step: 6,
            name: 'Read from BazaVozila',
            status: '✗ Failed',
            error: readError.message,
            code: readError.code
          });
        }

        // STEP 7: Try to write to BazaVozila
        try {
          const testData = [['Test', 'Debug', 'Data', 'Now', new Date().toISOString()]];
          
          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: 'BazaVozila!A2:E2',
            valueInputOption: 'RAW',
            resource: {
              values: testData
            }
          });

          debugInfo.steps.push({
            step: 7,
            name: 'Write Test Data',
            status: '✓ Success',
            testData: testData[0]
          });
        } catch (writeError) {
          debugInfo.steps.push({
            step: 7,
            name: 'Write Test Data',
            status: '✗ Failed',
            error: writeError.message,
            code: writeError.code
          });
        }

      } else {
        debugInfo.steps.push({
          step: 5,
          name: 'Find "BazaVozila" Sheet',
          status: '✗ NOT FOUND',
          availableSheets: spreadsheet.data.sheets.map(s => s.properties.title),
          suggestion: 'Create a sheet named exactly "BazaVozila" (case sensitive)'
        });
      }

    } catch (spreadsheetError) {
      debugInfo.steps.push({
        step: 4,
        name: 'Get Spreadsheet Metadata',
        status: '✗ Failed',
        error: spreadsheetError.message,
        code: spreadsheetError.code,
        suggestion: spreadsheetError.code === 404 
          ? 'Spreadsheet not found - check GOOGLE_SPREADSHEET_ID'
          : spreadsheetError.code === 403
          ? 'Permission denied - share spreadsheet with service account email'
          : 'Unknown error'
      });
    }

    // STEP 8: Summary
    const allStepsSuccessful = debugInfo.steps.every(
      step => !step.status || step.status.includes('✓')
    );

    debugInfo.summary = {
      overallStatus: allStepsSuccessful ? '✓ All checks passed' : '✗ Some checks failed',
      recommendation: allStepsSuccessful 
        ? 'Everything looks good! Try updating sheets again.'
        : 'Review failed steps above for specific issues.'
    };

    return res.status(200).json(debugInfo);

  } catch (error) {
    debugInfo.steps.push({
      step: 'UNEXPECTED',
      name: 'Unexpected Error',
      status: '✗ Critical failure',
      error: error.message,
      stack: error.stack
    });
    return res.status(200).json(debugInfo);
  }
}
