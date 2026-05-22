import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';
import { aiParsePlugin } from './scripts/aiParseMiddleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aiParsePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/.local/**', '**/node_modules/**', '**/.git/**'],
      },
      proxy: {
        // Proxy Firebase Auth handler so authDomain == app domain.
        // This avoids cross-site storage partitioning that breaks signInWithRedirect.
        '/__/auth': {
          target: 'https://mila1507.firebaseapp.com',
          changeOrigin: true,
          secure: true,
        },
        '/__/firebase': {
          target: 'https://mila1507.firebaseapp.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
