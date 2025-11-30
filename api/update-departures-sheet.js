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
        
        if (!row[0] || row[0].includes('resetovan')) continue;
        
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

  // ===== POST za kumulativno ažuriranje (BEZ BRISANJA) =====
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('=== Departures Sheet Cumulative Update Request ===');
  
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

    // ===== NOVA VALIDACIJA I GRUPISANJE =====
    const newRouteMap = {};
    const validationWarnings = [];
    
    vehicles.forEach(v => {
      const vehicleLabel = v.vehicleLabel || '';
      const routeDisplayName = v.routeDisplayName || '';
      const routeId = v.routeId || '';
      
      // DETALJNO LOGOVANJE
      console.log(`\n🚌 Vehicle ${vehicleLabel}:`);
      console.log(`   - routeDisplayName: "${routeDisplayName}"`);
      console.log(`   - routeId: "${routeId}"`);
      console.log(`   - destName: "${v.destName}"`);
      console.log(`   - startTime: "${v.startTime}"`);
      
      // PROVERA KONZISTENTNOSTI
      let finalRoute = null;
      
      // Prioritet: routeId preko routeDisplayName (jer je routeId precizniji)
      if (routeId && routeId.trim() !== '') {
        finalRoute = routeId.trim();
        
        // Ukloni vodeće nule ako postoje (00005 -> 5)
        if (/^0+\d+$/.test(finalRoute)) {
          finalRoute = finalRoute.replace(/^0+/, '');
          console.log(`   ✓ Cleaned routeId: "${finalRoute}"`);
        }
      } else if (routeDisplayName && routeDisplayName.trim() !== '') {
        finalRoute = routeDisplayName.trim();
        console.log(`   ⚠️ Using routeDisplayName (routeId missing)`);
      } else {
        console.log(`   ❌ ERROR: Both routeId and routeDisplayName are empty!`);
        validationWarnings.push({
          vehicle: vehicleLabel,
          issue: 'Missing route information',
          routeId,
          routeDisplayName
        });
        return; // Preskoči ovo vozilo
      }
      
      // DODATNA VALIDACIJA: Proveri da li se routeDisplayName i routeId slažu
      if (routeDisplayName && routeId) {
        const cleanedRouteId = routeId.replace(/^0+/, '');
        const cleanedDisplayName = routeDisplayName.trim();
        
        if (cleanedRouteId !== cleanedDisplayName) {
          console.log(`   ⚠️ MISMATCH WARNING:`);
          console.log(`      routeId (cleaned): "${cleanedRouteId}"`);
          console.log(`      routeDisplayName: "${cleanedDisplayName}"`);
          
          validationWarnings.push({
            vehicle: vehicleLabel,
            issue: 'Route ID mismatch',
            routeId: cleanedRouteId,
            routeDisplayName: cleanedDisplayName,
            usedRoute: finalRoute
          });
        }
      }
      
      const destName = v.destName || 'Unknown';
      const startTime = v.startTime || 'N/A';
      
      console.log(`   → Final route assigned: "${finalRoute}"`);
      
      // Dodaj u mapu
      if (!newRouteMap[finalRoute]) {
        newRouteMap[finalRoute] = {};
      }
      
      if (!newRouteMap[finalRoute][destName]) {
        newRouteMap[finalRoute][destName] = [];
      }
      
      newRouteMap[finalRoute][destName].push({
        startTime: startTime,
        vehicleLabel: vehicleLabel,
        timestamp: timestamp
      });
    });

    console.log(`\n📊 Validation Summary:`);
    console.log(`   - Total vehicles processed: ${vehicles.length}`);
    console.log(`   - Routes grouped: ${Object.keys(newRouteMap).length}`);
    console.log(`   - Validation warnings: ${validationWarnings.length}`);
    
    if (validationWarnings.length > 0) {
      console.log('\n⚠️ Validation Warnings:');
      validationWarnings.forEach((w, i) => {
        console.log(`   ${i + 1}. Vehicle ${w.vehicle}:`);
        console.log(`      Issue: ${w.issue}`);
        if (w.routeId) console.log(`      routeId: ${w.routeId}`);
        if (w.routeDisplayName) console.log(`      routeDisplayName: ${w.routeDisplayName}`);
        if (w.usedRoute) console.log(`      Used: ${w.usedRoute}`);
      });
    }

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

    // ===== Pročitaj postojeće podatke i mapiraj ih =====
    let existingData = [];
    const existingDeparturesMap = new Map();
    const routeStructure = new Map();
    
    try {
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:J`,
      });
      existingData = readResponse.data.values || [];
      console.log(`Found ${existingData.length} existing rows`);

      let currentRoute = null;
      let currentDirection = null;
      
      for (let i = 0; i < existingData.length; i++) {
        const row = existingData[i];
        
        if (row[0] && row[0].startsWith('Linija ')) {
          currentRoute = row[0].replace('Linija ', '').trim();
          if (!routeStructure.has(currentRoute)) {
            routeStructure.set(currentRoute, new Map());
          }
        } 
        else if (currentRoute && row[0] && row[0].startsWith('Smer: ')) {
          currentDirection = row[0].replace('Smer: ', '').trim();
          if (!routeStructure.get(currentRoute).has(currentDirection)) {
            routeStructure.get(currentRoute).set(currentDirection, []);
          }
        }
        else if (currentRoute && currentDirection && row[0] && row[0].match(/^\d{1,2}:\d{2}/)) {
          const startTime = row[0];
          const vehicleLabel = row[1] || '';
          const oldTimestamp = row[2] || '';
          
          const key = `${currentRoute}|${currentDirection}|${startTime}|${vehicleLabel}`;
          existingDeparturesMap.set(key, {
            row: i,
            startTime,
            vehicleLabel,
            timestamp: oldTimestamp
          });
          
          routeStructure.get(currentRoute).get(currentDirection).push({
            startTime,
            vehicleLabel,
            timestamp: oldTimestamp
          });
        }
      }
      
      console.log(`Mapped ${existingDeparturesMap.size} existing departures`);
      
    } catch (readError) {
      console.log('No existing data, starting fresh');
    }

    // ===== Grupisanje vozila po vremenu polaska =====
    const processedRouteMap = {};
    
    for (let route in newRouteMap) {
      processedRouteMap[route] = {};
      
      for (let direction in newRouteMap[route]) {
        const departures = newRouteMap[route][direction];
        const timeMap = new Map();
        
        departures.forEach(dep => {
          if (!timeMap.has(dep.startTime)) {
            timeMap.set(dep.startTime, []);
          }
          timeMap.get(dep.startTime).push({
            vehicleLabel: dep.vehicleLabel,
            timestamp: dep.timestamp
          });
        });
        
        processedRouteMap[route][direction] = Array.from(timeMap.entries()).map(([time, vehicles]) => ({
          startTime: time,
          vehicles: vehicles,
          vehicleLabels: vehicles.map(v => v.vehicleLabel).filter(l => l).join(' '),
          timestamp: vehicles[0].timestamp
        })).sort((a, b) => a.startTime.localeCompare(b.startTime));
      }
    }

    // ===== Integracija novih podataka sa postojećima =====
    let updatedCount = 0;
    let newCount = 0;
    const updateRequests = [];
    const appendRows = [];

    for (let route in processedRouteMap) {
      const directions = processedRouteMap[route];
      
      if (!routeStructure.has(route)) {
        console.log(`New route: ${route}`);
        routeStructure.set(route, new Map());
        
        appendRows.push([`Linija ${route}`, '', '', '', '', '', '', '', '', '']);
        
        for (let direction in directions) {
          routeStructure.get(route).set(direction, []);
          
          appendRows.push([`Smer: ${direction}`, '', '', '', '', '', '', '', '', '']);
          appendRows.push(['Polazak', 'Vozilo', 'Poslednji put viđen', '', '', '', '', '', '', '']);
          
          const departures = directions[direction];
          
          departures.forEach(dep => {
            appendRows.push([
              dep.startTime,
              dep.vehicleLabels,
              dep.timestamp,
              '', '', '', '', '', '', ''
            ]);
            
            routeStructure.get(route).get(direction).push(dep);
            newCount++;
          });
          
          appendRows.push(['', '', '', '', '', '', '', '', '', '']);
        }
        
        appendRows.push(['', '', '', '', '', '', '', '', '', '']);
      }
      else {
        for (let direction in directions) {
          
          if (!routeStructure.get(route).has(direction)) {
            console.log(`New direction: ${route} -> ${direction}`);
            routeStructure.get(route).set(direction, []);
            
            appendRows.push([`Smer: ${direction}`, '', '', '', '', '', '', '', '', '']);
            appendRows.push(['Polazak', 'Vozilo', 'Poslednji put viđen', '', '', '', '', '', '', '']);
            
            const departures = directions[direction];
            
            departures.forEach(dep => {
              appendRows.push([
                dep.startTime,
                dep.vehicleLabels,
                dep.timestamp,
                '', '', '', '', '', '', ''
              ]);
              
              routeStructure.get(route).get(direction).push(dep);
              newCount++;
            });
            
            appendRows.push(['', '', '', '', '', '', '', '', '', '']);
          }
          else {
            const departures = directions[direction];
            
            departures.forEach(dep => {
              const timeKey = `${route}|${direction}|${dep.startTime}`;
              
              let existingDeparture = null;
              for (let [key, value] of existingDeparturesMap.entries()) {
                if (key.startsWith(timeKey + '|')) {
                  existingDeparture = value;
                  break;
                }
              }
              
              if (existingDeparture) {
                const currentVehicles = existingDeparture.vehicleLabel.split(' ').filter(v => v);
                const newVehicles = dep.vehicleLabels.split(' ').filter(v => v);
                
                const allVehicles = [...new Set([...currentVehicles, ...newVehicles])];
                const combinedVehicles = allVehicles.join(' ');
                
                updateRequests.push({
                  range: `${sheetName}!B${existingDeparture.row + 1}:C${existingDeparture.row + 1}`,
                  values: [[combinedVehicles, dep.timestamp]]
                });
                
                existingDeparture.vehicleLabel = combinedVehicles;
                existingDeparture.timestamp = dep.timestamp;
                
                updatedCount++;
                console.log(`Updated ${dep.startTime}: ${combinedVehicles}`);
              }
              else {
                appendRows.push([
                  dep.startTime,
                  dep.vehicleLabels,
                  dep.timestamp,
                  '', '', '', '', '', '', ''
                ]);
                
                routeStructure.get(route).get(direction).push(dep);
                newCount++;
              }
            });
          }
        }
      }
    }

    console.log(`Updates: ${updatedCount}, New departures: ${newCount}`);

    // ===== Primeni izmene =====
    
    if (updateRequests.length > 0) {
      const batchUpdateData = {
        spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updateRequests
        }
      };
      
      await sheets.spreadsheets.values.batchUpdate(batchUpdateData);
      console.log(`✓ Updated ${updateRequests.length} timestamps`);
    }

    if (appendRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:J`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: appendRows
        }
      });
      console.log(`✓ Appended ${appendRows.length} new rows`);
    }

    if (appendRows.length > 0) {
      const formatRequests = [];
      const startRow = existingData.length;
      
      for (let i = 0; i < appendRows.length; i++) {
        const row = appendRows[i];
        const actualRow = startRow + i;
        
        if (row[0] && row[0].startsWith('Linija ')) {
          formatRequests.push({
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: actualRow,
                endRowIndex: actualRow + 1,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.12, green: 0.24, blue: 0.45 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    fontSize: 14,
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
        } else if (row[0] && row[0].startsWith('Smer: ')) {
          formatRequests.push({
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: actualRow,
                endRowIndex: actualRow + 1,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.85, green: 0.92, blue: 0.95 },
                  textFormat: {
                    foregroundColor: { red: 0.12, green: 0.24, blue: 0.45 },
                    fontSize: 12,
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
        } else if (row[0] === 'Polazak') {
          formatRequests.push({
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: actualRow,
                endRowIndex: actualRow + 1,
                startColumnIndex: 0,
                endColumnIndex: 3
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0
