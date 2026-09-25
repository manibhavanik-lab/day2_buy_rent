import { GoogleGenAI, mcpToTool } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Agent endpoint POST /api/ask
 * Answers visitor questions by letting Gemini choose among tools published by
 * the MCP servers listed in process.env.MCP_SERVERS.
 */
export default async function handler(req, res) {
  // CORS support for browser / preview cross-origin calls
  if (res.setHeader) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    const errorBody = { error: 'Method not allowed' };
    if (res.status && typeof res.status === 'function') {
      return res.status(405).json(errorBody);
    }
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(errorBody));
  }

  // 3) Check process.env.GEMINI_API_KEY before anything else
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const errBody = { error: 'GEMINI_API_KEY is not set. Add it in Vercel and redeploy.' };
    if (res.status && typeof res.status === 'function') {
      return res.status(503).json(errBody);
    }
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(errBody));
  }

  // 3) Validate question: missing or longer than 500 characters
  const question = req.body?.question || req.body?.prompt;
  if (!question || typeof question !== 'string' || !question.trim() || question.length > 500) {
    const errBody = { error: 'Question is missing or longer than 500 characters.' };
    if (res.status && typeof res.status === 'function') {
      return res.status(400).json(errBody);
    }
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(errBody));
  }

  const trimmedQuestion = question.trim();
  const unavailable = [];
  const connectedClients = [];

  try {
    // 4) Split process.env.MCP_SERVERS on commas and trim each address.
    const serverAddresses = (process.env.MCP_SERVERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const address of serverAddresses) {
      let client = null;
      try {
        const url = new URL(address);
        client = new Client({ name: 'renter-agent', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(url);

        // Connect with 8 seconds timeout
        await Promise.race([
          client.connect(transport),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timed out after 8 seconds')), 8000)
          ),
        ]);

        connectedClients.push(client);
      } catch (err) {
        unavailable.push({
          address,
          reason: err?.message ? err.message.split('\n')[0] : 'Connection failed',
        });
        if (client) {
          try {
            await client.close();
          } catch (_) {}
        }
      }
    }

    // 5) Call ai.models.generateContent with model "gemini-3.8-flash"
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction =
      'answer only from tool results; give the source and the fetched_at time for every figure; if a tool returns an error or nothing, say so in one sentence and do not guess; at most 120 words.';

    const tools = connectedClients.length > 0 ? [mcpToTool(...connectedClients)] : [];

    let response;
    // Transient retry once on 503 / 429
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: trimmedQuestion,
          config: {
            systemInstruction,
            ...(tools.length > 0 ? { tools } : {}),
            automaticFunctionCalling: {
              maximumRemoteCalls: 6,
            },
          },
        });
        break;
      } catch (geminiErr) {
        if (attempt === 1 && (geminiErr.status === 503 || geminiErr.status === 429)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw geminiErr;
      }
    }

    // 6) Build tool_calls from response.automaticFunctionCallingHistory
    const tool_calls = [];
    const history = response?.automaticFunctionCallingHistory || [];
    const functionCalls = [];
    const functionResponses = [];

    for (const content of history) {
      if (!content?.parts) continue;
      for (const part of content.parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
        if (part.functionResponse) {
          functionResponses.push(part.functionResponse);
        }
      }
    }

    for (let i = 0; i < functionCalls.length; i++) {
      const call = functionCalls[i];
      const match = functionResponses[i];

      let failed = false;
      if (match?.response) {
        const respData = match.response;
        if (
          respData.error ||
          respData.isError === true ||
          (typeof respData === 'string' && respData.toLowerCase().includes('error')) ||
          (typeof respData === 'object' && JSON.stringify(respData).toLowerCase().includes('"error"'))
        ) {
          failed = true;
        }
      }

      tool_calls.push({
        name: call.name,
        args: call.args || {},
        failed,
      });
    }

    // 7) Return 200 with answer, tool_calls, unavailable, model, answered_at
    const payload = {
      answer: response?.text || '',
      tool_calls,
      unavailable,
      model: 'gemini-3.8-flash',
      answered_at: new Date().toISOString(),
    };

    if (res.status && typeof res.status === 'function') {
      return res.status(200).json(payload);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(payload));
  } catch (err) {
    // If Gemini itself fails, return 502 with its status and a one-line reason.
    const status = err.status || 502;
    let reason = err.message ? err.message.split('\n')[0] : 'Gemini generation failed';
    try {
      const parsed = JSON.parse(reason);
      if (parsed?.error?.message) {
        reason = parsed.error.message;
      }
    } catch (_) {}

    const errPayload = {
      error: 'Gemini request failed',
      status,
      reason,
      unavailable,
    };

    if (res.status && typeof res.status === 'function') {
      return res.status(502).json(errPayload);
    }
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(errPayload));
  } finally {
    // 7) Close every client in a finally block.
    for (const client of connectedClients) {
      try {
        await client.close();
      } catch (_) {}
    }
  }
}
