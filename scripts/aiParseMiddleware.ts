import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { runAIParse } from './aiParseShared';
import { runParseHpp } from './aiParseHppShared';

async function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function aiParsePlugin(): Plugin {
  return {
    name: 'ai-parse-middleware',
    configureServer(server) {
      server.middlewares.use('/api/ai-parse', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }
        try {
          const body = await readJson(req);
          const result = await runAIParse(body);
          sendJson(res, 200, result);
        } catch (err: any) {
          console.error('[ai-parse] error', err);
          sendJson(res, 500, { error: err?.message || 'AI error' });
        }
      });

      server.middlewares.use('/api/parse-hpp', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }
        try {
          const body = await readJson(req);
          const result = await runParseHpp(body);
          sendJson(res, 200, result);
        } catch (err: any) {
          console.error('[parse-hpp] error', err);
          sendJson(res, 500, { error: err?.message || 'AI error' });
        }
      });
    },
  };
}
