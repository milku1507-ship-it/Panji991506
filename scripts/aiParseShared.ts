import { GoogleGenAI, Type } from '@google/genai';

export const SYSTEM_INSTRUCTION = `Anda adalah asisten cerdas pemrosesan input transaksi UMKM berbasis AI Gemini yang terhubung ke Database Toko.
Tugas Anda: Memahami kalimat bebas/natural dari user, mencocokkan ke Database Toko (Produk & Bahan Baku), dan merapikan menjadi JSON terstruktur.

KEUNGGULAN & KECERDASAN DATABASE (PENTING):
1. **Penanganan Typo & Sinonym**:
   - Cocokkan kata singkatan, typo, atau sebutan lokal user ke nama asli di Database.
   - Contoh: "baso" / "bso" -> cocokkan ke bahan baku "Bakso Sapi" atau produk "Bakso Granat".
   - Contoh: "cabe" -> cocokkan ke bahan baku "Cabe Jablay" atau "Cabe Merah".
   - Contoh: "terigu" -> cocokkan ke "Tepung Terigu".

2. **Auto-Link Material ID (Bahan Baku)**:
   - Jika transaksi adalah pengeluaran belanja bahan baku yang ada di "DAFTAR BAHAN BAKU (INGREDIENTS)", Anda WAJIB mengisi field "materialId" dengan ID asli bahan baku tersebut dari database.
   - Set "kategori" ke kategori bahan baku tersebut (misal "Bumbu", "Bahan Utama", "Kemasan") atau kategori HPP terdekat.

3. **Kalkulasi Cerdas Otomatis (Auto Qty / Auto Nominal dari Database)**:
   - Jika user HANYA menginput nominal/harga (misal "cabe jablay 20000") dan di DB harga "Cabe Jablay" adalah Rp 80 per gram:
     -> Hitung qty_beli otomatis = Math.round(20000 / 80) = 250 gram.
   - Jika user HANYA menginput qty (misal "cabe jablay 250gr") dan di DB harga "Cabe Jablay" adalah Rp 80 per gram:
     -> Hitung nominal otomatis = Math.round(250 * 80) = 20000 rupiah.
   - Jika user sebut nominal & qty (misal "cabe jablay 250gr 25000"), gunakan nominal 25000 dan qty_beli 250.

4. **Multi-Transaksi**:
   - Jika user sebut banyak item (mis: "beli tapioka 25kg 210000, cabe jablay 20rb, dan es teh 3 porsi"):
     pisahkan menjadi transaksi tersendiri!
   - Untuk PENJUALAN produk multi varian dari produk yang sama, gabungkan ke "penjualan_detail".

Aturan field per transaksi:
- "jenis": "Pemasukan" atau "Pengeluaran".
- "kategori": nama kategori resmi dari daftar kategori.
- "tanggal": YYYY-MM-DD.
- "nominal": angka rupiah bulat.
- "qty_beli": jumlah kuantitas fisik yang dibeli.
- "materialId": ID bahan baku dari DAFTAR BAHAN BAKU jika cocok.
- "keterangan": nama ringkas transaksi (mis: "Beli Cabe Jablay 250 gram").
- "penjualan_detail": array produk & varian jika jenis Pemasukan Penjualan.

Output: JSON sesuai schema.`;

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
              materialId: { type: Type.STRING },
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
  const { customApiKey, history = [], userMessage, products = [], ingredients = [], categories = [], hppCategories = [], currentForm = {}, today } = body || {};
  
  const apiKey = customApiKey || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  
  if (!apiKey) {
    throw new Error('Gemini API Key belum dikonfigurasi. Masukkan API Key Anda di menu Pengaturan API Key AI.');
  }

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

  const ingredientCatalog = ingredients.map((i: any) => ({
    id: i.id,
    nama: i.name,
    kategori: i.category,
    harga_per_unit: i.price,
    satuan: i.unit,
  }));

  const context = `TODAY: ${today}
KATEGORI TERSEDIA (name|jenis):
${categories.map((c: any) => `- ${c.name} | ${c.type}`).join('\n')}

KATEGORI HPP TAMBAHAN:
${(hppCategories || []).map((h: string) => `- ${h}`).join('\n')}

DAFTAR BAHAN BAKU (INGREDIENTS):
${JSON.stringify(ingredientCatalog, null, 2)}

DAFTAR PRODUK (PRODUCTS):
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
      parts: [{ text: `KONTEKS DATABASE APLIKASI:\n${context}\n\nPESAN USER:\n${userMessage}` }],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3.7-flash',
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
      clarification_question: 'Maaf, saya tidak bisa memahami format kalimat. Coba sebutkan nama barang dan nominalnya.',
      transactions: [],
    };
  }
}
