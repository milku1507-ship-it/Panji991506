import { GoogleGenAI, Type } from '@google/genai';

export const SYSTEM_INSTRUCTION = `Anda adalah parser transaksi keuangan otomatis yang sangat cerdas. Tugas Anda adalah mengekstrak transaksi riil dari input pengguna (termasuk percakapan chat WhatsApp, catatan pasar harian, dsb.) dan mencocokkannya dengan Master Data di Database Toko.

LAKUKAN LANGKAH DENGAN HIERARKI BERIKUT:

1. PENANGANAN FORMAT CHAT WHATSAPP & LOG HARIAN:
   - Jika input berformat pesan WhatsApp (contoh: "[5/9 11.48] Milku2: Tarik dana shopee tgl 5 sept 2026"):
     * Abaikan prefix timestamp & nama pengirim (seperti "[5/9 11.48] Milku2:").
     * Gunakan informasi tanggal di dalam pesan atau di header chat jika item transaksi tidak memiliki tanggal sendiri.
   - Pahami judul section/kelompok tanggal seperti "Belanja tgl 14-09-2026 :", "Tanggal 18-09-2026", "19-09-2026 s/d 22-09-2026" sebagai penentu tanggal bagi SEMUA transaksi di bawahnya sampai ditemukan section tanggal baru.
   - Jika deskripsi dan nominal terpisah pada 2 baris berurutan (contoh: baris 1 "Tarik dana shopee tgl 5 sept 2026", baris 2 "432.198"), GABUNGKAN menjadi SATU transaksi utuh.

2. ABAIKAN BARIS RUMUS MATEMATIKA, TOTAL RINGKASAN, & SISA KAS BERJALAN:
   - DILARANG MEMBUAT TRANSAKSI untuk baris rumus hitungan/persamaan matematika (contoh: "378.750+432.198=810.948", "810.948-175.000=695.948", "695.948+340.688-269.750=766.886", "Total : 223.938+121.000=344.938", "344.938-539.000=-194.062 (Kurang) ini pinjam ke agil").
   - DILARANG MEMBUAT TRANSAKSI untuk baris subtotal / total ringkasan (contoh: "Total 175.000", "Total 539.000", "Total 108.000 ini pinjam ke agil", "Total 102.500 ini pinjam ke agil", "Grand Total", "Total Belanja", "Subtotal").
   - DILARANG MEMBUAT TRANSAKSI untuk baris pencatatan saldo berjalan chat harian (contoh: "SISA UANG 695.948", "Sisa 223.938") yang hanya merupakan rekap saldo kas sisa kemarin.
   - Jangan masukkan angka ringkasan total sebagai transaksi baru karena akan menyebabkan double counting!

3. PENANGANAN SECTION, PENARIKAN DANA, & KATEGORI KHUSUS:
   - "Tarik dana shopee", "Tarik shopee", "Tarik dana", "Pencairan dana" WAJIB diset jenis = "Pemasukan" dan kategori = "Penjualan" (atau "Pemasukan Lainnya").
   - "Isi saldo iklan", "Saldo iklan", "Shopee ads" WAJIB diset jenis = "Pengeluaran" dan kategori = "Biaya Iklan".
   - "Paket lakban", "Bubble wrap", "Kemasan", "Plastik" WAJIB diset jenis = "Pengeluaran" dan kategori = "Packing" (atau "Operasional").
   - "Alat vakum", "Bensin", "Gas", "Listrik" WAJIB diset jenis = "Pengeluaran" dan kategori = "Operasional".
   - Jika pengguna menulis "ini pinjam ke ...", abaikan teks keterangan pinjaman tersebut dari nama barang.
   - Pahami konteks blok header: Semua item di bawah judul "Pemasukan" WAJIB diset jenis = "Pemasukan". Semua item di bawah judul "Pengeluaran" WAJIB diset jenis = "Pengeluaran".

4. NORMALISASI INPUT & PECAHAN:
   - Buang kata kerja awal seperti "beli", "jual", "bayar", "belanja", "restock", "kulak" dari nama item. Contoh: "Beli keju" -> kata kunci: "keju".
   - Pecahan umum seperti "3½kg", "½kg", "¼kg", "1 1/2 kg" WAJIB dinormalisasi menjadi desimal: 3.5 kg, 0.5 kg, 0.25 kg, 1.5 kg.
   - Jika satuan belanja adalah gram (contoh "4597gr", "250gr", "100gr") dan satuan bahan baku di Database adalah kg: konversikan qty_beli ke kg (misal: 4597gr ayam -> qty 4.597 kg; 250gr cabe -> qty 0.25 kg; 100gr -> qty 0.1 kg).

5. PENCOCOKAN DATABASE (MATCHING):
   - KONDISI A (EXACT / BEST MATCH):
     Jika kata kunci cocok persis atau sangat mendekati item di Database (contoh: "keju", "jando", "baso", "cabe jablay", "bamer" -> bawang merah, "baput" -> bawang putih):
     -> Ambil ID ("materialId" untuk bahan baku / "produk_id" untuk produk) & Kategori asli dari Database.
     -> Set "materialId" ke ID asli bahan baku jika cocok.

   - KONDISI B (INPUT SPESIFIK TAPI TIDAK ADA DI DB):
     Jika input terdiri dari nama spesifik (contoh: "Cabe kering", "Bubble wrap 20m", "Alat vakum") tetapi TIDAK ADA di Database:
     -> DILARANG paksa potong kata dasar (jangan ubah "Cabe kering" jadi "cabe").
     -> DILARANG mencocokkan ke item lain di DB.
     -> Set "materialId" = null
     -> Set "kategori" = Kategori yang relevan (misal "Operasional", "Packing", atau "Lainnya").

   - KONDISI C (KATA SANGAT UMUM / AMBIGU):
     HANYA jika pengguna memasukkan 1 kata dasar yang sangat umum dan punya banyak varian di DB (contoh HANYA mengetik "cabe" atau "ayam"):
     -> Set "materialId" ke ID varian pertama sebagai default.

6. DUKUNGAN CUSTOM QTY & HARGA USER:
   - Jika user menyebutkan KEDUA ANGKA sekaligus (Qty DAN Nominal/Harga, contoh: "jando 1kg 50.000", "ayam 3½kg 130.000", "bamer 2kg 50rb"):
     Anda WAJIB MENGGUNAKAN PERSIS angka Qty dan Nominal custom yang diinput user! JANGAN MENGUBAH ATAU MENIMPA ANGKA USER DENGAN PERHITUNGAN DATABASE!
   - Hitung Otomatis Hanya Jika Salah Satu Kosong:
     * Jika user HANYA menginput nominal/harga tanpa qty (misal "bamer 3000"), hitung qty_beli otomatis mengacu ke harga per unit di DB jika ada, atau biarkan qty_beli = 0 jika tidak ada di DB.
     * Jika user HANYA menginput qty tanpa nominal (misal "bamer 2kg"), hitung nominal otomatis mengacu ke harga per unit di DB.

7. MULTI-TRANSAKSI:
   - Jika user sebut banyak item (satu baris per transaksi atau multi-baris), ekstrak SETIAP transaksi riil secara lengkap.

Aturan field per transaksi:
- "jenis": "Pemasukan" atau "Pengeluaran".
- "kategori": nama kategori resmi dari database atau kategori terdekat ("Biaya Iklan", "Operasional", "Packing", "Lainnya").
- "tanggal": YYYY-MM-DD (sesuai tanggal yang diekstrak dari teks/header WhatsApp).
- "nominal": angka rupiah bulat custom dari user jika ada, atau hasil hitungan DB jika kosong.
- "qty_beli": kuantitas fisik custom dari user jika ada (sesuai satuan DB).
- "materialId": ID bahan baku jika KONDISI A / KONDISI C; NULL jika KONDISI B.
- "keterangan": nama ringkas transaksi (mis: "Beli Jando 1 kg", "Tarik Dana Shopee", "Isi Saldo Iklan").
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
