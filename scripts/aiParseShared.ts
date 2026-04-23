import { GoogleGenAI, Type } from '@google/genai';

export const SYSTEM_INSTRUCTION = `Anda adalah asisten input transaksi untuk aplikasi pembukuan UMKM dalam Bahasa Indonesia.
Tugas Anda: dari kalimat natural user, hasilkan JSON yang berisi SATU ATAU LEBIH transaksi yang siap diisi ke form.

PENTING — Multi-transaksi:
- User SERING menyebutkan banyak item dalam satu kalimat, dipisah koma, "dan", titik koma, baris baru, atau penomoran (1., 2., dst).
- Contoh: "tapioka 25kg 210000, terigu setengah ons 3000" = 2 transaksi terpisah.
- Contoh: "jual cireng ayam ori 50 pcs, keju 30 pcs" = bisa 1 transaksi penjualan dengan 2 varian (digabung jadi 1 penjualan_detail), KECUALI tanggal/kategori berbeda.
- Pisahkan tiap item belanja/pengeluaran berbeda menjadi entry "transactions" tersendiri.
- Untuk PENJUALAN dari produk yang sama dengan tanggal yang sama, gabungkan ke 1 transaksi (multi varian).

Aturan field per transaksi:
- "jenis" hanya boleh "Pemasukan" atau "Pengeluaran".
- "kategori" harus diambil dari daftar kategori yang diberikan. Jika user menyebut menjual produk, gunakan "Penjualan" (Pemasukan).
- "tanggal" format YYYY-MM-DD. "hari ini"/"today" gunakan tanggal yang diberikan sebagai TODAY.
- "nominal" angka rupiah (tanpa titik/koma). "500rb"=500000, "1.5jt"=1500000, "2juta"=2000000, "210000"=210000, "3000"=3000.
- Jika kategori "Penjualan" + ada produk: isi "penjualan_detail" dengan ID asli (produk_id, varian_id) dari katalog.
- "keterangan" ringkas (mis: "Beli Tapioka 25kg", "Beli Terigu 0.5 ons").
- "qty_beli" jumlah pembelian bahan (untuk pengeluaran bahan baku).

Aturan needs_clarification:
- Set TRUE hanya jika ada item yang TIDAK BISA Anda parse sama sekali atau ambigu serius.
- Jika sebagian besar item jelas, parse semua yang jelas dan TANYA hanya untuk yang ambigu.

Output:
- "transactions": array dari objek { summary, fields }. summary = ringkasan singkat dalam Bahasa Indonesia.
- "summary": ringkasan keseluruhan (mis: "2 transaksi siap dicatat").
- JANGAN PERNAH meringkas semua item menjadi 1 transaksi jika item-item itu beda kategori/produk/jenis.`;

export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    needs_clarification: { type: Type.BOOLEAN },
    clarification_question: { type: Type.STRING },
    summary: { type: Type.STRING },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
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
        required: ['fields'],
      },
    },
  },
  required: ['transactions'],
};

export async function runAIParse(body: any) {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey) {
    throw new Error('AI integration belum dikonfigurasi.');
  }

  const { history = [], userMessage, products = [], categories = [], currentForm = {}, today } = body || {};

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
  try {
    return JSON.parse(text);
  } catch {
    return {
      needs_clarification: true,
      clarification_question: 'Maaf, saya tidak bisa memahami. Bisa diulang?',
      transactions: [],
    };
  }
}
