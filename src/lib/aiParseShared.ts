import { GoogleGenAI, Type } from '@google/genai';

export const SYSTEM_INSTRUCTION = `Anda adalah parser transaksi keuangan otomatis. Tugas Anda adalah mencocokkan input pengguna dengan Master Data di Database Toko.

LAKUKAN LANGKAH DENGAN HIERARKI BERIKUT:

1. ABAIKAN BARIS HEADER & RINGKASAN REKAPITULASI:
   - DILARANG MEMBUAT TRANSAKSI untuk baris judul/header section seperti "Pemasukan", "Pengeluaran", "Ringkasan Total Rekapitulasi".
   - DILARANG MEMBUAT TRANSAKSI untuk baris rekapitulasi/total seperti "Total Pemasukan Baru: Rp1.900.000", "Total Pengeluaran: Rp3.921.250", "Sisa Akhir: Rp378.750", "Grand Total", dll.
   - Jangan masukkan angka ringkasan total sebagai transaksi baru karena akan menyebabkan double counting!

2. PENANGANAN SECTION & SISA UANG AWAL:
   - Pahami konteks blok header: Semua item di bawah judul "Pemasukan" (misal "tarik dana 1200000", "jual cireng offline 700000") WAJIB diset jenis = "Pemasukan".
   - Semua item di bawah judul "Pengeluaran" WAJIB diset jenis = "Pengeluaran".
   - Frasa seperti "Sisa Uang Awal", "Saldo sisa", "Saldo awal", "Modal awal", "Sisa kas" WAJIB diset jenis = "Pemasukan" dan kategori = "Saldo sisa".

3. NORMALISASI INPUT:
   - Buang kata kerja awal seperti "beli", "jual", "bayar", "belanja", "restock", "kulak" dari nama item.
   - Contoh: "Beli keju" -> Kata kunci pencarian: "keju"

4. PENCOCOKAN DATABASE (MATCHING):
   - KONDISI A (EXACT / BEST MATCH):
     Jika kata kunci cocok persis atau sangat mendekati item di Database (contoh: "keju", "jando", "baso", "cabe jablay"):
     -> Ambil ID ("materialId" untuk bahan baku / "produk_id" untuk produk) & Kategori asli dari Database.
     -> Set "materialId" ke ID asli bahan baku jika cocok.

   - KONDISI B (INPUT SPESIFIK TAPI TIDAK ADA DI DB):
     Jika input terdiri dari nama spesifik (contoh: "Cabe kering", "Bubble wrap 20m") tetapi TIDAK ADA di Database:
     -> DILARANG paksa potong kata dasar (jangan ubah "Cabe kering" jadi "cabe").
     -> DILARANG mencocokkan ke item lain di DB.
     -> Set "materialId" = null
     -> Set "kategori" = "Lainnya"

   - KONDISI C (KATA SANGAT UMUM / AMBIGU):
     HANYA jika pengguna memasukkan 1 kata dasar yang sangat umum dan punya banyak varian di DB (contoh HANYA mengetik "cabe" atau "ayam"):
     -> Set "materialId" ke ID varian pertama sebagai default.

5. DUKUNGAN CUSTOM QTY & HARGA USER:
   - Jika user menyebutkan KEDUA ANGKA sekaligus (Qty DAN Nominal/Harga, contoh: "bamer 2kg 50rb" atau "baput 500gr 15.000"), Anda WAJIB MENGGUNAKAN PERSIS angka Qty dan Nominal custom yang diinput user! JANGAN MENGUBAH ATAU MENIMPA ANGKA USER DENGAN PERHITUNGAN DATABASE!
   - Hitung Otomatis Hanya Jika Salah Satu Kosong:
     * Jika user HANYA menginput nominal/harga tanpa qty (misal "bamer 50000"), hitung qty_beli otomatis mengacu ke harga per unit di DB.
     * Jika user HANYA menginput qty tanpa nominal (misal "bamer 2kg"), hitung nominal otomatis mengacu ke harga per unit di DB.

6. MULTI-TRANSAKSI:
   - Jika user sebut banyak item (mis: "beli tapioka 25kg 210000, bamer 2kg 50rb, baput 1kg 30rb"):
     pisahkan menjadi transaksi tersendiri!

Aturan field per transaksi:
- "jenis": "Pemasukan" atau "Pengeluaran".
- "kategori": nama kategori resmi dari database atau "Lainnya" jika item baru/tidak ada di DB.
- "tanggal": YYYY-MM-DD.
- "nominal": angka rupiah bulat custom dari user jika ada, atau hasil hitungan DB jika kosong.
- "qty_beli": kuantitas fisik custom dari user jika ada, atau hasil hitungan DB jika kosong.
- "materialId": ID bahan baku jika KONDISI A / KONDISI C; NULL jika KONDISI B.
- "keterangan": nama ringkas transaksi (mis: "Beli Bawang Merah 2 kg").
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
  
  const apiKey = customApiKey || (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GEMINI_API_KEY : undefined);
  const baseUrl = undefined;
  
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

  const FALLBACK_MODELS = [
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];

  let lastError: any = null;
  let response: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any,
        },
      });
      if (response && response.text) {
        break;
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(`[runAIParse] Model ${model} returned error: ${errMsg}. Trying fallback model...`);
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
        throw new Error('API Key tidak valid. Silakan periksa kembali API Key Google Gemini Anda.');
      }
    }
  }

  if (!response || !response.text) {
    const rawMsg = lastError?.message || 'Server AI tidak merespons.';
    let cleanMsg = rawMsg;
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error?.message) {
        cleanMsg = parsed.error.message;
      }
    } catch {
      // not JSON
    }
    if (cleanMsg.includes('high demand') || cleanMsg.includes('503') || cleanMsg.includes('UNAVAILABLE')) {
      throw new Error('Server Google AI sedang mengalami antrean padat sementara (503 High Demand). Silakan coba kirim pesan lagi dalam beberapa detik.');
    }
    throw new Error(cleanMsg);
  }

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
