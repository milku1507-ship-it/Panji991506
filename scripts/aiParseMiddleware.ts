import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, Type } from '@google/genai';

const SYSTEM_INSTRUCTION = `Anda adalah asisten input transaksi untuk aplikasi pembukuan UMKM dalam Bahasa Indonesia.
Tugas Anda: dari kalimat natural user, hasilkan JSON yang mengisi field form transaksi.

Aturan:
- "jenis" hanya boleh "Pemasukan" atau "Pengeluaran".
- "kategori" harus diambil dari daftar kategori yang diberikan. Jika user menyebut menjual produk, gunakan "Penjualan" (Pemasukan).
- "tanggal" format YYYY-MM-DD. "hari ini"/"today" gunakan tanggal yang diberikan sebagai TODAY.
- "nominal" angka rupiah (tanpa titik/koma). "500rb"=500000, "1.5jt"=1500000, "2juta"=2000000.
- Jika kategori "Penjualan" dan user menyebut nama produk + qty, isi "penjualan_detail":
  cocokkan dengan produk & varian dari daftar. Gunakan ID asli (produk_id, varian_id).
  Jika user tidak menyebut varian spesifik tapi produk hanya punya 1 varian, pakai varian itu.
- "keterangan" ringkas, deskriptif (mis: "Jual Cireng Isi Ayam Ori 50 pcs").
- Jika ada field yang ambigu/kurang jelas, set "needs_clarification" = true dan tulis pertanyaan singkat di "clarification_question".
  Contoh ambigu: produk tidak ditemukan, varian tidak jelas saat ada banyak varian, nominal tidak disebut untuk pengeluaran umum.
- Jika data lengkap, set "needs_clarification" = false dan buat "summary" ringkas untuk konfirmasi user.
- JANGAN mengasumsikan harga; jika nominal tidak disebut user pada penjualan, gunakan harga jual varian * qty sebagai nominal.
- JANGAN mengisi field yang tidak Anda yakini.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    needs_clarification: { type: Type.BOOLEAN },
    clarification_question: { type: Type.STRING },
    summary: { type: Type.STRING },
    fields: {
      type: Type.OBJECT,
      properties: {
        tanggal: { type: Type.STRING },
        jenis: { type: Type.STRING },
        kategori: { type: Type.STRING },
        keterangan: { type: Type.STRING },
        nominal: { type: Type.NUMBER },
        qty_beli: { type: Type.NUMBER },
        penjualan_detail: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              produk_id: { type: Type.STRING },
              produk_nama: { type: Type.STRING },
              varian: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    varian_id: { type: Type.STRING },
                    varian_nama: { type: Type.STRING },
                    qty: { type: Type.NUMBER },
                  },
                  required: ['varian_id', 'varian_nama', 'qty'],
                },
              },
            },
            required: ['produk_id', 'produk_nama', 'varian'],
          },
        },
      },
    },
  },
  required: ['needs_clarification', 'fields'],
};

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
          const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
          const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
          if (!apiKey) {
            sendJson(res, 500, { error: 'AI integration belum dikonfigurasi.' });
            return;
          }

          const body = await readJson(req);
          const { history = [], userMessage, products = [], categories = [], currentForm = {}, today } = body;

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: baseUrl ? { apiVersion: '', baseUrl } : undefined,
          });

          const productCatalog = products.map((p: any) => ({
            produk_id: p.id,
            produk_nama: p.nama,
            varian: (p.varian || []).map((v: any) => ({
              varian_id: v.id,
              varian_nama: v.nama,
              harga_jual: v.harga_jual,
            })),
          }));

          const context = `TODAY: ${today}
KATEGORI TERSEDIA (name|jenis):
${categories.map((c: any) => `- ${c.name} | ${c.type}`).join('\n')}

DAFTAR PRODUK:
${JSON.stringify(productCatalog, null, 2)}

CURRENT FORM STATE:
${JSON.stringify(currentForm, null, 2)}`;

          const contents = [
            ...history.map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            {
              role: 'user',
              parts: [{ text: `KONTEKS APLIKASI:\n${context}\n\nPESAN USER:\n${userMessage}` }],
            },
          ];

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: responseSchema as any,
            },
          });

          const text = response.text || '{}';
          let parsed: any;
          try { parsed = JSON.parse(text); } catch { parsed = { needs_clarification: true, clarification_question: 'Maaf, saya tidak bisa memahami. Bisa diulang?', fields: {} }; }
          sendJson(res, 200, parsed);
        } catch (err: any) {
          console.error('[ai-parse] error', err);
          sendJson(res, 500, { error: err?.message || 'AI error' });
        }
      });
    },
  };
}
