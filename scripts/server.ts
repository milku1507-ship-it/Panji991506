import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/ai-parse', async (req, res) => {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    if (!apiKey) {
      res.status(500).json({ error: 'AI integration belum dikonfigurasi.' });
      return;
    }

    const { history = [], userMessage, products = [], categories = [], currentForm = {}, today } = req.body || {};

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
    res.json(parsed);
  } catch (err: any) {
    console.error('[ai-parse] error', err);
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
