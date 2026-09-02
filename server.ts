import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { runAIParse } from './scripts/aiParseShared.js';
import { runParseHpp } from './scripts/aiParseHppShared.js';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Add CORS headers for good measure, especially for OPTIONS preflight
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, x-gemini-api-key');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Proxy Firebase Auth handler BEFORE express.json
  app.use(
    createProxyMiddleware({
      target: 'https://mila1507.firebaseapp.com',
      changeOrigin: true,
      secure: true,
      xfwd: false,
      pathFilter: ['/__/auth/**', '/__/firebase/**'],
    })
  );

  app.use(express.json({ limit: '2mb' }));

  app.post('/api/test-gemini-key', async (req, res) => {
    try {
      const headerKey = req.headers['x-gemini-api-key'] as string;
      const customKey = headerKey || req.body?.apiKey;
      const apiKey = customKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ success: false, message: 'API Key belum diisi.' });
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

      res.json({ success: true, message: 'Koneksi ke Gemini AI berhasil!', text: response.text });
    } catch (err: any) {
      console.error('[test-gemini-key] error', err);
      res.status(400).json({ success: false, message: err?.message || 'API Key tidak valid atau kuota habis.' });
    }
  });

  app.post('/api/ai-parse', async (req, res) => {
    try {
      const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
      const result = await runAIParse({ ...req.body, customApiKey });
      res.json(result);
    } catch (err: any) {
      console.error('[ai-parse] error', err);
      res.status(500).json({ error: err?.message || 'AI error' });
    }
  });

  app.post('/api/parse-hpp', async (req, res) => {
    try {
      const customApiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.customApiKey;
      const result = await runParseHpp({ ...req.body, customApiKey });
      res.json(result);
    } catch (err: any) {
      console.error('[parse-hpp] error', err);
      res.status(500).json({ error: err?.message || 'AI error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    // Development mode: Use Vite as middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
