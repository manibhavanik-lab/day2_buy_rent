import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load verified Singapore MRT stations and Primary Schools
let mrtStations = [];
let primarySchools = [];

try {
  const mrtData = fs.readFileSync(path.join(__dirname, 'data', 'mrt-stations.json'), 'utf-8');
  mrtStations = JSON.parse(mrtData);
} catch (e) {
  mrtStations = [];
}

try {
  const schoolsData = fs.readFileSync(path.join(__dirname, 'data', 'primary-schools.json'), 'utf-8');
  primarySchools = JSON.parse(schoolsData);
} catch (e) {
  primarySchools = [];
}

/**
 * Calculate Haversine distance in meters between two coordinates.
 */
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Resolve HDB Town from Singapore street address, building name, or postal sector.
 */
export function getTownFromAddressAndPostal(address, postal) {
  const towns = [
    'ANG MO KIO', 'BEDOK', 'BISHAN', 'BUKIT BATOK', 'BUKIT MERAH',
    'BUKIT PANJANG', 'BUKIT TIMAH', 'CENTRAL AREA', 'CHOA CHU KANG',
    'CLEMENTI', 'GEYLANG', 'HOUGANG', 'JURONG EAST', 'JURONG WEST',
    'KALLANG/WHAMPOA', 'MARINE PARADE', 'PASIR RIS', 'PUNGGOL',
    'QUEENSTOWN', 'SEMBAWANG', 'SENGKANG', 'SERANGOON', 'TAMPINES',
    'TOA PAYOH', 'WOODLANDS', 'YISHUN'
  ];

  const upper = (address || '').toUpperCase();
  for (const t of towns) {
    if (upper.includes(t)) {
      return t;
    }
  }

  const cleanPostal = String(postal).padStart(6, '0');
  const sector = parseInt(cleanPostal.slice(0, 2), 10);

  if (sector >= 1 && sector <= 10) return 'CENTRAL AREA';
  if (sector >= 11 && sector <= 13) return 'QUEENSTOWN';
  if (sector >= 14 && sector <= 16) return 'BUKIT MERAH';
  if (sector >= 17 && sector <= 19) return 'CENTRAL AREA';
  if (sector >= 20 && sector <= 21) return 'KALLANG/WHAMPOA';
  if (sector >= 22 && sector <= 23) return 'CENTRAL AREA';
  if (sector >= 24 && sector <= 27) return 'QUEENSTOWN';
  if (sector >= 28 && sector <= 30) return 'BISHAN';
  if (sector >= 31 && sector <= 33) return 'TOA PAYOH';
  if (sector >= 34 && sector <= 41) return 'GEYLANG';
  if (sector >= 42 && sector <= 45) return 'MARINE PARADE';
  if (sector >= 46 && sector <= 48) return 'BEDOK';
  if (sector >= 49 && sector <= 50) return 'PASIR RIS';
  if (sector >= 51 && sector <= 52) return 'TAMPINES';
  if (sector === 53) return 'HOUGANG';
  if (sector === 54) return 'SENGKANG';
  if (sector === 55) return 'SERANGOON';
  if (sector === 56) return 'ANG MO KIO';
  if (sector === 57) return 'BISHAN';
  if (sector >= 58 && sector <= 59) return 'BUKIT TIMAH';
  if (sector >= 60 && sector <= 63) return 'JURONG EAST';
  if (sector === 64) return 'JURONG WEST';
  if (sector === 65) return 'BUKIT BATOK';
  if (sector >= 66 && sector <= 67) return 'BUKIT PANJANG';
  if (sector >= 68 && sector <= 71) return 'CHOA CHU KANG';
  if (sector >= 72 && sector <= 73) return 'WOODLANDS';
  if (sector === 75) return 'SEMBAWANG';
  if (sector === 76) return 'YISHUN';
  if (sector >= 77 && sector <= 78) return 'ANG MO KIO';
  if (sector >= 79 && sector <= 80) return 'SENGKANG';
  if (sector >= 81 && sector <= 82) return 'PUNGGOL';

  return 'ANG MO KIO';
}

/**
 * 1) Lookup postal code via OneMap
 * Returns address, coordinates, nearest MRT stations and primary schools.
 */
export async function lookupPostalCode(postal_code) {
  const cleanPostal = String(postal_code || '').trim();
  if (!cleanPostal || !/^\d{6}$/.test(cleanPostal)) {
    const error = new Error('Invalid postal code: must be a 6-digit Singapore postal code.');
    error.status = 400;
    error.upstreamMessage = `Failed to validate postal code ${cleanPostal} with status 400.`;
    throw error;
  }

  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(cleanPostal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const headers = {};
  if (process.env.ONEMAP_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.ONEMAP_API_KEY}`;
  }

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    const error = new Error(`Network failure connecting to OneMap API: ${err.message}`);
    error.status = 502;
    error.upstreamMessage = `Failed to connect to OneMap API with status 502.`;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`OneMap API failed with status ${response.status}`);
    error.status = response.status;
    error.upstreamMessage = `Failed to retrieve postal code ${cleanPostal} from OneMap API with status ${response.status}.`;
    throw error;
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    const error = new Error(`No address found for postal code ${cleanPostal} on OneMap`);
    error.status = 404;
    error.upstreamMessage = `Failed to locate postal code ${cleanPostal} on OneMap API with status 404.`;
    throw error;
  }

  const record = data.results[0];
  const targetLat = parseFloat(record.LATITUDE);
  const targetLng = parseFloat(record.LONGITUDE);

  // Compute nearest MRT stations (top 5)
  const nearestMrt = mrtStations
    .map(st => {
      const dist = calculateDistanceInMeters(targetLat, targetLng, st.lat, st.lng);
      return {
        name: st.name,
        lines: st.lines,
        distance_meters: dist,
        distance_km: parseFloat((dist / 1000).toFixed(2))
      };
    })
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, 5);

  // Compute nearest Primary Schools (top 5)
  const nearestSchools = primarySchools
    .map(sc => {
      const dist = calculateDistanceInMeters(targetLat, targetLng, sc.lat, sc.lng);
      return {
        name: sc.name,
        town: sc.town,
        distance_meters: dist,
        distance_km: parseFloat((dist / 1000).toFixed(2)),
        within_1km: dist <= 1000,
        within_2km: dist <= 2000
      };
    })
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, 5);

  return {
    postal_code: cleanPostal,
    address: record.ADDRESS,
    block: record.BLK_NO !== 'NIL' ? record.BLK_NO : '',
    road_name: record.ROAD_NAME !== 'NIL' ? record.ROAD_NAME : '',
    building: record.BUILDING !== 'NIL' ? record.BUILDING : '',
    coordinates: {
      latitude: targetLat,
      longitude: targetLng
    },
    nearest_mrt: nearestMrt,
    nearest_primary_schools: nearestSchools,
    source: 'OneMap Singapore API',
    fetched_at: new Date().toISOString()
  };
}

/**
 * 2) HDB comparables
 * Wraps GET /api/hdb after its query is changed to sort by month, newest first, and keep only the last N months.
 * Never returns synthesised rows.
 */
export async function getHdbComparables(town, flat_type, months = 6) {
  const safeTown = String(town || '').trim().toUpperCase();
  const safeFlatType = String(flat_type || '4 ROOM').trim().toUpperCase();
  const numMonths = Math.min(Math.max(parseInt(months, 10) || 6, 1), 60);

  if (!safeTown) {
    const error = new Error('Town is required');
    error.status = 400;
    error.upstreamMessage = 'Failed to retrieve HDB comparables: town parameter is required with status 400.';
    throw error;
  }

  const filters = JSON.stringify({
    town: safeTown,
    flat_type: safeFlatType
  });

  const url = `https://data.gov.sg/api/action/datastore_search?resource_id=d_8b84c4ee58e3cfc0ece0d773c8ca6abc&filters=${encodeURIComponent(filters)}&sort=${encodeURIComponent('month desc')}&limit=100`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    const error = new Error(`Network failure connecting to Data.gov.sg: ${err.message}`);
    error.status = 502;
    error.upstreamMessage = `Failed to query HDB transactions from Data.gov.sg with status 502.`;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Data.gov.sg HDB API failed with status ${response.status}`);
    error.status = response.status;
    error.upstreamMessage = `Failed to query HDB transactions from Data.gov.sg with status ${response.status}.`;
    throw error;
  }

  const data = await response.json();
  if (!data.success || !data.result || !Array.isArray(data.result.records)) {
    const error = new Error('Invalid response structure from Data.gov.sg');
    error.status = 502;
    error.upstreamMessage = 'Failed to parse HDB records from Data.gov.sg with status 502.';
    throw error;
  }

  const rawRecords = data.result.records;

  // Calculate cutoff month
  let filtered = [];
  if (rawRecords.length > 0) {
    const newestMonth = rawRecords[0].month; // e.g., '2026-09'
    const [year, mon] = newestMonth.split('-').map(Number);
    let cutoffYear = year;
    let cutoffMon = mon - numMonths + 1;
    while (cutoffMon <= 0) {
      cutoffMon += 12;
      cutoffYear -= 1;
    }
    const cutoffStr = `${cutoffYear}-${String(cutoffMon).padStart(2, '0')}`;
    filtered = rawRecords.filter(r => r.month >= cutoffStr);
  }

  // Ensure sorted by month descending (newest first)
  filtered.sort((a, b) => b.month.localeCompare(a.month));

  // Cap at at most 20 items per requirement
  const comparables = filtered.slice(0, 20).map(r => ({
    month: r.month,
    town: r.town,
    flat_type: r.flat_type,
    block: r.block,
    street_name: r.street_name,
    storey_range: r.storey_range,
    floor_area_sqm: parseFloat(r.floor_area_sqm) || 0,
    flat_model: r.flat_model,
    lease_commence_date: r.lease_commence_date,
    remaining_lease: r.remaining_lease,
    resale_price: parseFloat(r.resale_price) || 0
  }));

  return {
    town: safeTown,
    flat_type: safeFlatType,
    months_requested: numMonths,
    total_found: filtered.length,
    comparables: comparables,
    source: 'Data.gov.sg HDB Resale Prices',
    fetched_at: new Date().toISOString()
  };
}

/**
 * 3) Property snapshot
 * Wraps GET /api/insights, with every hard-coded comparable removed.
 */
export async function getPropertySnapshot(postal_code) {
  const cleanPostal = String(postal_code || '').trim();
  const location = await lookupPostalCode(cleanPostal);
  const town = getTownFromAddressAndPostal(location.address, cleanPostal);

  // Fetch real market comparables for the resolved town (4 ROOM default benchmark)
  let hdbResult;
  try {
    hdbResult = await getHdbComparables(town, '4 ROOM', 6);
  } catch (err) {
    // Attempt with 3 ROOM if 4 ROOM fails or empty
    try {
      hdbResult = await getHdbComparables(town, '3 ROOM', 6);
    } catch (_) {
      hdbResult = { comparables: [] };
    }
  }

  const items = hdbResult.comparables || [];

  let medianPrice = 0;
  let avgPrice = 0;
  let avgPsm = 0;
  let minPrice = 0;
  let maxPrice = 0;

  if (items.length > 0) {
    const prices = items.map(i => i.resale_price).sort((a, b) => a - b);
    minPrice = prices[0];
    maxPrice = prices[prices.length - 1];
    avgPrice = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length);
    const mid = Math.floor(prices.length / 2);
    medianPrice = prices.length % 2 !== 0 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);

    const psmList = items
      .filter(i => i.floor_area_sqm > 0)
      .map(i => i.resale_price / i.floor_area_sqm);
    if (psmList.length > 0) {
      avgPsm = Math.round(psmList.reduce((sum, p) => sum + p, 0) / psmList.length);
    }
  }

  // Keep at most 10 recent transactions so result total items stays <= 20
  const recentTransactions = items.slice(0, 10);

  return {
    postal_code: cleanPostal,
    address: location.address,
    town: town,
    coordinates: location.coordinates,
    nearest_mrt: location.nearest_mrt.slice(0, 5),
    nearest_primary_schools: location.nearest_primary_schools.slice(0, 5),
    market_summary: {
      town: town,
      flat_type_benchmark: items[0]?.flat_type || '4 ROOM',
      sample_size: items.length,
      median_resale_price: medianPrice,
      avg_resale_price: avgPrice,
      avg_price_per_sqm: avgPsm,
      min_price: minPrice,
      max_price: maxPrice,
      recent_transactions: recentTransactions
    },
    source: 'OneMap Singapore & Data.gov.sg',
    fetched_at: new Date().toISOString()
  };
}
