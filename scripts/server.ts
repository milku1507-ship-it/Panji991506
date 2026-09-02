import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { runAIParse } from './aiParseShared';
import { runParseHpp } from './aiParseHppShared';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Proxy Firebase Auth handler BEFORE express.json so request bodies are forwarded as-is.
// This makes authDomain == app domain, avoiding cross-site storage partitioning that
// breaks signInWithRedirect on Chrome/Android and other modern browsers.
// IMPORTANT: use pathFilter (NOT app.use(prefix, ...)) so the original `/__/auth/...`
// path is preserved when forwarded — otherwise Firebase Hosting returns "Site Not Found".
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

const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
