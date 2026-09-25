import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import handler from './api/mcp.js';
import onemapHandler from './api/onemap.js';
import hdbHandler from './api/hdb.js';
import insightsHandler from './api/insights.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Register MCP server handler on POST and GET /api/mcp
app.post('/api/mcp', handler);
app.get('/api/mcp', handler);
app.options('/api/mcp', handler);

// Register application data routes
app.get('/api/onemap', onemapHandler);
app.get('/api/hdb', hdbHandler);
app.get('/api/insights', insightsHandler);

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
