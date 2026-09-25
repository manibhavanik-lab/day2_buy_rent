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
  if (req.method !== 'POST') {
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
  if (req.headers && (!req.headers.accept || !req.headers.accept.includes('text/event-stream'))) {
    req.headers.accept = req.headers.accept
      ? `${req.headers.accept}, text/event-stream`
      : 'application/json, text/event-stream';
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
