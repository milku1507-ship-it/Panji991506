import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { runAIParse } from './aiParseShared';
import { runParseHpp } from './aiParseHppShared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Proxy Firebase Auth handler BEFORE express.json so request bodies are forwarded as-is.
// This makes authDomain == app domain, avoiding cross-site storage partitioning that
// breaks signInWithRedirect on Chrome/Android and other modern browsers.
const firebaseAuthProxy = createProxyMiddleware({
  target: 'https://mila1507.firebaseapp.com',
  changeOrigin: true,
  secure: true,
  xfwd: false,
});
app.use('/__/auth', firebaseAuthProxy);
app.use('/__/firebase', firebaseAuthProxy);

app.use(express.json({ limit: '2mb' }));

app.post('/api/ai-parse', async (req, res) => {
  try {
    const result = await runAIParse(req.body);
    res.json(result);
  } catch (err: any) {
    console.error('[ai-parse] error', err);
    res.status(500).json({ error: err?.message || 'AI error' });
  }
});

app.post('/api/parse-hpp', async (req, res) => {
  try {
    const result = await runParseHpp(req.body);
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

const port = Number(process.env.PORT) || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
