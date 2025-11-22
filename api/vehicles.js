export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const timestamp = Date.now();
    const randomSalt = Math.random().toString(36).substring(2, 15);
    const BASE_URL = 'https://rt.buslogic.baguette.pirnet.si/beograd/rt.json';
    const targetUrl = `${BASE_URL}?_=${timestamp}&salt=${randomSalt}`;

    // Fetch data from external API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.entity) {
      return res.status(200).json({ vehicles: [], tripUpdates: [] });
    }

    // Filter and process vehicles
    const vehicles = [];
    const tripUpdates = [];

    data.entity.forEach(entitet => {
      // Process vehicle positions
      if (entitet.vehicle && entitet.vehicle.position) {
        const info = entitet.vehicle;
        const vehicleLabel = info.vehicle.label;

        // Filter invalid garage numbers (server-side filtering!)
        if (!isValidGarageNumber(vehicleLabel)) {
          return; // Skip this vehicle
        }

        vehicles.push({
          id: info.vehicle.id,
          label: vehicleLabel,
          routeId: info.trip.routeId,
          startTime: info.trip.startTime,
          lat: parseFloat(info.position.latitude),
          lon: parseFloat(info.position.longitude)
        });
      }

      // Process trip updates for destinations
      if (entitet.tripUpdate && entitet.tripUpdate.trip && 
          entitet.tripUpdate.stopTimeUpdate && entitet.tripUpdate.vehicle) {
        const updates = entitet.tripUpdate.stopTimeUpdate;
        const vehicleId = entitet.tripUpdate.vehicle.id;

        if (updates.length > 0 && vehicleId) {
          const lastStopId = updates[updates.length - 1].stopId;
          tripUpdates.push({
            vehicleId: vehicleId,
            destination: lastStopId
          });
        }
      }
    });

    // Return processed data
    res.status(200).json({
      vehicles: vehicles,
      tripUpdates: tripUpdates,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vehicle data',
      message: error.message 
    });
  }
}

// Server-side validation function (hidden from client!)
function isValidGarageNumber(label) {
  if (!label || typeof label !== 'string') return false;
  
  if (label.startsWith('P')) {
    return label.length >= 6;
  }
  
  return true;
}
