import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ===== GET za čitanje podataka =====
  if (req.method === 'GET') {
    console.log('=== Departures Sheet Read Request ===');
    
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
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const sheetName = 'Polasci';

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:J`,
      });

      const rows = response.data.values || [];
      console.log(`Read ${rows.length} rows from sheet`);

      const routes = [];
      let currentRoute = null;
      let currentDirection = null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        if (!row[0]) continue;
        
        if (row[0].startsWith('Linija ')) {
          if (currentRoute) {
            routes.push(currentRoute);
          }
          
          currentRoute = {
            routeName: row[0].replace('Linija ', '').trim(),
            directions: []
          };
          currentDirection = null;
        }
        else if (row[0].startsWith('Smer: ')) {
          if (currentRoute) {
            currentDirection = {
              directionName: row[0].replace('Smer: ', '').trim(),
              departures: []
            };
            currentRoute.directions.push(currentDirection);
          }
        }
        else if (row[0] === 'Polazak') {
          continue;
        }
        else if (currentDirection && row[0] && row[0].match(/^\d{1,2}:\d{2}/)) {
          currentDirection.departures.push({
            startTime: row[0],
            vehicleLabel: row[1] || '',
            timestamp: row[2] || ''
          });
        }
      }

      if (currentRoute) {
        routes.push(currentRoute);
      }

      console.log(`Parsed ${routes.length} routes`);

      return res.status(200).json({
        success: true,
        routes: routes,
        totalRoutes: routes.length
      });

    } catch (error) {
      console.error('Read error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ===== POST za dodavanje novih podataka (BEZ BRISANJA) =====
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== Departures Sheet Update Request ===');
  
  try {
    const { vehicles } = req.body;

    if (!vehicles || !Array.isArray(vehicles)) {
      console.error('Invalid data format');
      return res.status(400).json({ error: 'Invalid data format' });
    }

    console.log(`Received ${vehicles.length} vehicles for departure tracking`);

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

    // Grupisanje vozila po linijama
    const routeMap = {};
    
    vehicles.forEach(v => {
      const route = v.routeDisplayName || v.routeId;
      const destName = v.destName || 'Unknown';
      const vehicleLabel = v.vehicleLabel || '';
      const startTime = v.startTime || 'N/A';
      
      if (!routeMap[route]) {
        routeMap[route] = {};
      }
      
      if (!routeMap[route][destName]) {
        routeMap[route][destName] = [];
      }
      
      routeMap[route][destName].push({
        startTime: startTime,
        vehicleLabel: vehicleLabel,
        timestamp: timestamp
      });
    });

    // Sortiraj polaske po vremenu
    for (let route in routeMap) {
      for (let direction in routeMap[route]) {
        routeMap[route][direction].sort((a, b) => {
          return a.startTime.localeCompare(b.startTime);
        });
      }
    }

    console.log(`Grouped into ${Object.keys(routeMap).length} routes`);

    // Proveri/Kreiraj sheet "Polasci"
    const sheetName = 'Polasci';
    let sheetId = null;
    
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = spreadsheet.data.sheets.find(
        s => s.properties.title === sheetName
      );
      
      if (existingSheet) {
        sheetId = existingSheet.properties.sheetId;
        console.log(`✓ Sheet "${sheetName}" exists (ID: ${sheetId})`);
      } else {
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

    // Pročitaj postojeće podatke
    let existingData = [];
    try {
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:J`,
      });
      existingData = readResponse.data.values || [];
      console.log(`Found ${existingData.length} existing rows`);
    } catch (readError) {
      console.log('No existing data');
    }

    // Pronađi postojeće linije i smerove
    const existingRoutes = new Map();
    let currentRoute = null;
    let currentDirection = null;
    
    for (let i = 0; i < existingData.length; i++) {
      const row = existingData[i];
      if (row[0] && row[0].startsWith('Linija ')) {
        currentRoute = row[0].replace('Linija ', '');
        if (!existingRoutes.has(currentRoute)) {
          existingRoutes.set(currentRoute, {
            startRow: i,
            directions: new Map()
          });
        }
        currentDirection = null;
      } else if (currentRoute && row[0] && row[0].startsWith('Smer: ')) {
        currentDirection = row[0].replace('Smer: ', '');
        existingRoutes.get(currentRoute).directions.set(currentDirection, {
          headerRow: i,
          departures: new Map()
        });
      } else if (currentRoute && currentDirection && row[0] && row[0].match(/^\d{1,2}:\d{2}/)) {
        const time = row[0];
        const vehicle = row[1] || '';
        const key = `${time}_${vehicle}`;
        const dirData = existingRoutes.get(currentRoute).directions.get(currentDirection);
        dirData.departures.set(key, i);
      }
    }

    // Gradi nove podatke za UPDATE
    let updatedRows = 0;
    let newRows = 0;
    const updates = [];

    // Sortiraj linije numerički
    const sortedRoutes = Object.keys(routeMap).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    for (let route of sortedRoutes) {
      const directions = routeMap[route];
      const existingRoute = existingRoutes.get(route);
      
      if (!existingRoute) {
        // Nova linija - dodaj na kraj
        const startRow = existingData.length + 1;
        
        updates.push({
          range: `${sheetName}!A${startRow}`,
          values: [[`Linija ${route}`, '', '', '', '', '', '', '', '', '']]
        });
        
        let rowOffset = 1;
        
        const sortedDirections = Object.keys(directions).sort();
        
        for (let direction of sortedDirections) {
          const departures = directions[direction];
          
          updates.push({
            range: `${sheetName}!A${startRow + rowOffset}`,
            values: [[`Smer: ${direction}`, '', '', '', '', '', '', '', '', '']]
          });
          rowOffset++;
          
          updates.push({
            range: `${sheetName}!A${startRow + rowOffset}`,
            values: [['Polazak', 'Vozilo', 'Poslednji put viđen', '', '', '', '', '', '', '']]
          });
          rowOffset++;
          
          departures.forEach(dep => {
            updates.push({
              range: `${sheetName}!A${startRow + rowOffset}`,
              values: [[dep.startTime, dep.vehicleLabel, dep.timestamp, '', '', '', '', '', '', '']]
            });
            rowOffset++;
            newRows++;
          });
          
          updates.push({
            range: `${sheetName}!A${startRow + rowOffset}`,
            values: [['', '', '', '', '', '', '', '', '', '']]
          });
          rowOffset++;
        }
        
        console.log(`✓ Nova linija ${route} - dodato ${rowOffset} redova`);
        
      } else {
        // Postojeća linija - ažuriraj smerove
        const sortedDirections = Object.keys(directions).sort();
        
        for (let direction of sortedDirections) {
          const departures = directions[direction];
          const existingDir = existingRoute.directions.get(direction);
          
          if (!existingDir) {
            // Novi smer u postojećoj liniji - dodaj na kraj linije
            console.log(`✓ Novi smer ${direction} u liniji ${route}`);
            // Ovde bi trebalo dodati logiku za ubacivanje novog smera
            // Za sada preskačemo
            continue;
          }
          
          // Ažuriraj postojeće polaske
          departures.forEach(dep => {
            const key = `${dep.startTime}_${dep.vehicleLabel}`;
            const existingRow = existingDir.departures.get(key);
            
            if (existingRow) {
              // Ažuriraj timestamp postojećeg polaska
              updates.push({
                range: `${sheetName}!C${existingRow + 1}`,
                values: [[dep.timestamp]]
              });
              updatedRows++;
            } else {
              // Dodaj novi polazak nakon postojećih
              const lastRow = Math.max(...Array.from(existingDir.departures.values()), existingDir.headerRow);
              updates.push({
                range: `${sheetName}!A${lastRow + 2}`,
                values: [[dep.startTime, dep.vehicleLabel, dep.timestamp, '', '', '', '', '', '', '']]
              });
              newRows++;
            }
          });
        }
      }
    }

    console.log(`Updates prepared: ${updatedRows} updated, ${newRows} new`);

    // Primeni update-e
    if (updates.length > 0) {
      const BATCH_SIZE = 100;
      
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: {
            valueInputOption: 'RAW',
            data: batch
          }
        });
        
        console.log(`✓ Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(updates.length/BATCH_SIZE)} written`);
        
        if (i + BATCH_SIZE < updates.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    console.log('=== Departures Update Complete ===');

    res.status(200).json({ 
      success: true, 
      updatedRows: updatedRows,
      newRows: newRows,
      totalUpdates: updates.length,
      timestamp,
      sheetUsed: sheetName
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected error',
      details: error.message
    });
  }
      }
