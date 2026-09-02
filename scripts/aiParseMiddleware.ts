import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { runAIParse } from './aiParseShared';
import { runParseHpp } from './aiParseHppShared';
import { GoogleGenAI } from '@google/genai';

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
      server.middlewares.use('/api/test-gemini-key', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { success: false, message: 'Method not allowed' });
          return;
        }
        try {
          const body = await readJson(req);
          const headerKey = req.headers['x-gemini-api-key'] as string;
          const apiKey = headerKey || body?.apiKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

          if (!apiKey) {
            sendJson(res, 400, { success: false, message: 'API Key belum diisi.' });
            return;
          }

          const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: baseUrl ? { apiVersion: '', baseUrl } : undefined,
          });

          const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: 'Tolong konfirmasi koneksi API key dengan membalas "OK".',
          });

          sendJson(res, 200, { success: true, message: 'Koneksi ke Gemini AI berhasil!', text: response.text });
        } catch (err: any) {
          console.error('[test-gemini-key] error', err);
          sendJson(res, 400, { success: false, message: err?.message || 'API Key tidak valid atau kuota habis.' });
        }
      });

      server.middlewares.use('/api/ai-parse', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }
        try {
          const body = await readJson(req);
          const customApiKey = (req.headers['x-gemini-api-key'] as string) || body?.customApiKey;
          const result = await runAIParse({ ...body, customApiKey });
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
          const customApiKey = (req.headers['x-gemini-api-key'] as string) || body?.customApiKey;
          const result = await runParseHpp({ ...body, customApiKey });
          sendJson(res, 200, result);
        } catch (err: any) {
          console.error('[parse-hpp] error', err);
          sendJson(res, 500, { error: err?.message || 'AI error' });
        }
      });
    },
  };
}

