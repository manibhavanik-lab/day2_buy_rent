import { lookupPostalCode } from '../lib/rental-service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status ? res.status(405).json({ error: 'Method not allowed' }) : (res.statusCode = 405, res.end(JSON.stringify({ error: 'Method not allowed' })));
  }

  const query = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const postalCode = query.postal_code || query.postal || query.searchVal;

  if (!postalCode) {
    return res.status ? res.status(400).json({ error: 'postal_code query parameter is required' }) : (res.statusCode = 400, res.end(JSON.stringify({ error: 'postal_code query parameter is required' })));
  }

  try {
    const data = await lookupPostalCode(postalCode);
    if (res.status) {
      return res.status(200).json(data);
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(data));
    }
  } catch (err) {
    const status = err.status || 500;
    const body = { error: err.upstreamMessage || err.message };
    if (res.status) {
      return res.status(status).json(body);
    } else {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(body));
    }
  }
}
