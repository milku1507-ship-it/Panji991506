const fs = require('fs');
let code = fs.readFileSync('src/components/ApiKeyDialog.tsx', 'utf8');

if (!code.includes('import { GoogleGenAI } from')) {
    code = code.replace(/import \{ db \} from '\.\.\/db';/, "import { db } from '../db';\nimport { GoogleGenAI } from '@google/genai';");
}

const target = `    try {
      const res = await fetch('/api/test-gemini-key', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKey.trim(),
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      
      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (res.ok && data?.success) {
        setTestResult({ success: true, message: 'Koneksi AI Gemini Berhasil! API Key valid dan siap digunakan.' });
        toast.success('API Key valid!');
      } else {
        setTestResult({ success: false, message: data?.message || \`Gagal terhubung (\${res.status}). Periksa kembali API Key Anda.\` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Gagal menghubungi server.' });
    }`;

const replace = `    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: 'Tolong konfirmasi koneksi API key dengan membalas "OK".',
      });
      setTestResult({ success: true, message: 'Koneksi AI Gemini Berhasil! API Key valid dan siap digunakan.' });
      toast.success('API Key valid!');
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'API Key tidak valid atau kuota habis.' });
    }`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/ApiKeyDialog.tsx', code);
