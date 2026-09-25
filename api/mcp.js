import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  lookupPostalCode,
  getHdbComparables,
  getPropertySnapshot,
} from '../lib/rental-service.js';

/**
 * Register renter tools on an McpServer instance.
 */
function registerTools(server) {
  // Tool 1: renter_lookup_postal_code
  server.registerTool(
    'renter_lookup_postal_code',
    {
      description:
        'Returns verified address details, geographical coordinates, nearest MRT stations, and nearby primary schools for a Singapore postal code. Data is retrieved directly in real time from the official OneMap Singapore API. Use this tool when you need to resolve a six-digit postal code into street details, transit connectivity, and nearby educational institutions. It does not provide historical transaction prices, rental yields, or interior property specifications.',
      inputSchema: {
        postal_code: z
          .string()
          .regex(/^\d{6}$/, 'Must be a 6-digit Singapore postal code')
          .describe("A 6-digit Singapore postal code, such as '560560' or '048581'."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ postal_code }) => {
      try {
        const result = await lookupPostalCode(postal_code);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error.upstreamMessage ||
          `Failed to retrieve postal code from OneMap API with status ${error.status || 500}.`;
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
        };
      }
    }
  );

  // Tool 2: renter_hdb_comparables
  server.registerTool(
    'renter_hdb_comparables',
    {
      description:
        "Returns actual recent Housing & Development Board (HDB) resale transactions filtered by town and flat type sorted with the newest records first for the specified time window. Data is read directly from Singapore's official Data.gov.sg HDB Resale Prices dataset. Use this tool when you need market comparable prices, price per square meter, remaining lease terms, and recent transaction volume to evaluate fair rental or purchase benchmarks. It does not include private residential condominiums, landed estates, or commercial property transactions.",
      inputSchema: {
        town: z
          .string()
          .min(2)
          .describe(
            "HDB town name in Singapore in capital letters, such as 'ANG MO KIO', 'BEDOK', 'TAMPINES', or 'JURONG WEST'."
          ),
        flat_type: z
          .string()
          .min(2)
          .describe(
            "HDB flat model or room type, such as '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', or 'EXECUTIVE'."
          ),
        months: z
          .number()
          .int()
          .positive()
          .max(60)
          .default(6)
          .describe(
            'Number of past months of transactions to retrieve, sorted newest first, up to 60 months.'
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ town, flat_type, months }) => {
      try {
        const result = await getHdbComparables(town, flat_type, months);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error.upstreamMessage ||
          `Failed to query HDB transactions from Data.gov.sg with status ${error.status || 500}.`;
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
        };
      }
    }
  );

  // Tool 3: renter_property_snapshot
  server.registerTool(
    'renter_property_snapshot',
    {
      description:
        'Returns a comprehensive property intelligence snapshot combining location verification, nearby amenities, and current market transaction insights for a given postal code. Data is compiled from live OneMap geospatial services and official government housing data. Use this tool when an agent requires a unified macro overview of a neighborhood profile and prevailing pricing dynamics before making a rental decision. It does not guarantee current vacant rental listing availability or negotiated tenancy contract terms.',
      inputSchema: {
        postal_code: z
          .string()
          .regex(/^\d{6}$/, 'Must be a 6-digit Singapore postal code')
          .describe(
            "A 6-digit Singapore postal code to inspect for location intelligence and market comparables, such as '560560'."
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ postal_code }) => {
      try {
        const result = await getPropertySnapshot(postal_code);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error.upstreamMessage ||
          `Failed to retrieve property snapshot from upstream services with status ${error.status || 500}.`;
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: message,
            },
          ],
        };
      }
    }
  );
}

/**
 * MCP Server HTTP Handler for /api/mcp
 */
export default async function handler(req, res) {
  // Set CORS headers for cross-origin MCP client access
  if (res.setHeader) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // If client sends GET with text/event-stream, proceed to McpServer SSE handler
  const isSSE = req.method === 'GET' && req.headers && req.headers.accept && req.headers.accept.includes('text/event-stream');

  // Handle standard browser navigation or health checks via GET
  if (req.method === 'GET' && !isSSE) {
    const acceptsHtml = req.headers && req.headers.accept && req.headers.accept.includes('text/html');

    if (acceptsHtml) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Server: renter-server (1.0.0)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f3f4f6; margin: 0; padding: 2.5rem 1rem; line-height: 1.5; }
    .container { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; background: #064e3b; color: #34d399; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; border: 1px solid #059669; }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.75rem; color: #ffffff; }
    p { color: #9ca3af; margin: 0 0 1.5rem 0; }
    .card { background: #1f2937; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; border: 1px solid #374151; }
    .card h3 { margin: 0 0 0.25rem 0; font-size: 1rem; color: #60a5fa; font-family: monospace; }
    .card p { margin: 0; font-size: 0.875rem; color: #d1d5db; }
    pre { background: #030712; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.8125rem; color: #a5f3fc; border: 1px solid #1e293b; }
    a.btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 6px; font-weight: 500; font-size: 0.875rem; transition: background 0.15s; }
    a.btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge"><span class="badge-dot"></span> MCP Server Online & Ready</div>
    <h1>renter-server v1.0.0</h1>
    <p>Streamable HTTP Model Context Protocol (MCP) server for Singapore HDB and private rental analytics.</p>
    
    <h2 style="font-size: 1.125rem; margin: 1.5rem 0 0.75rem 0;">Available MCP Tools</h2>
    <div class="card">
      <h3>renter_lookup_postal_code</h3>
      <p>Geocode a Singapore 6-digit postal code into official address, latitude, and longitude using OneMap.</p>
    </div>
    <div class="card">
      <h3>renter_hdb_comparables</h3>
      <p>Fetch official recent HDB median rental transactions and rent per sqm from Data.gov.sg.</p>
    </div>
    <div class="card">
      <h3>renter_property_snapshot</h3>
      <p>Combine location coordinates, closest MRT station distance, and median rent benchmarks into a single view.</p>
    </div>

    <h2 style="font-size: 1.125rem; margin: 1.5rem 0 0.75rem 0;">How to Invoke (POST)</h2>
    <p style="margin-bottom: 0.5rem;">External agents and MCP clients connect to this endpoint via JSON-RPC 2.0 HTTP POST:</p>
    <pre>curl -X POST https://day2buyrent.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'</pre>

    <div style="margin-top: 1.5rem;">
      <a class="btn" href="/">Open Web Dashboard & Interactive Explorer &rarr;</a>
    </div>
  </div>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      return res.end(html);
    }

    const infoBody = {
      status: 'online',
      server: 'renter-server',
      version: '1.0.0',
      protocol: 'Streamable HTTP (MCP 2024-11-05 / 2025-11-25)',
      tools: [
        {
          name: 'renter_lookup_postal_code',
          description: 'Geocode a Singapore 6-digit postal code into official address, latitude, and longitude.',
        },
        {
          name: 'renter_hdb_comparables',
          description: 'Fetch recent HDB rental transactions from Data.gov.sg filtered by town and flat type.',
        },
        {
          name: 'renter_property_snapshot',
          description: 'Aggregate location, nearby MRT distance, and median rent benchmarks.',
        },
      ],
      usage: 'Send JSON-RPC 2.0 POST requests to this endpoint or open in browser to view the HTML documentation.',
    };

    if (res.status && typeof res.status === 'function') {
      return res.status(200).json(infoBody);
    } else {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(infoBody, null, 2));
    }
  }

  if (req.method !== 'POST' && !isSSE) {
    const errorBody = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed',
      },
      id: null,
    };

    if (res.status && typeof res.status === 'function') {
      return res.status(405).json(errorBody);
    } else {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(errorBody));
    }
  }

  // Ensure accept header meets Streamable HTTP expectations for MCP clients
  if (!req.headers['accept'] || req.headers['accept'] === '*/*') {
    req.headers['accept'] = 'application/json, text/event-stream';
  } else {
    if (!req.headers['accept'].includes('text/event-stream')) {
      req.headers['accept'] += ', text/event-stream';
    }
    if (!req.headers['accept'].includes('application/json')) {
      req.headers['accept'] = 'application/json, ' + req.headers['accept'];
    }
  }

  const server = new McpServer({
    name: 'renter-server',
    version: '1.0.0',
  });

  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', async () => {
    try {
      await transport.close();
    } catch (_) {}
    try {
      await server.close();
    } catch (_) {}
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
