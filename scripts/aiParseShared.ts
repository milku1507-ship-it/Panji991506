import { GoogleGenAI, Type } from '@google/genai';

export const SYSTEM_INSTRUCTION = `Anda adalah asisten cerdas pemrosesan input transaksi UMKM berbasis AI Gemini yang terhubung ke Database Toko.
Tugas Anda: Memahami kalimat bebas/natural dari user, menentukan jenis transaksi (Pemasukan vs Pengeluaran), mencocokkan Kategori & Bahan Baku/Produk ke Database Toko, dan merapikan menjadi JSON terstruktur.

KECERDASAN DETEKSI JENIS & KATEGORI TRANSAKSI (SANGAT PENTING):
1. **Pemasukan (Income / Sales)**:
   - Terdeteksi dari kata kunci: "jual", "terjual", "laku", "omset", "pemasukan", "dapat", "terima", "pesanan", "catering", "pelanggan", "modal", "saldo", dll.
   - ATAU jika nama item yang ditulis cocok dengan nama barang di "DAFTAR PRODUK (PRODUCTS)".
   - Kategori: Set ke "Pemasukan Penjualan", "Penjualan", atau nama kategori Pemasukan resmi dari database.
   - Jika cocok produk, WAJIB sertakan "penjualan_detail" dengan produk_id, varian_id, dan qty.

2. **Pengeluaran (Expense / Purchases / Operational)**:
   - Terdeteksi dari kata kunci: "beli", "belanja", "bayar", "kulakan", "restock", "gaji", "upah", "listrik", "air", "sewa", "bensin", "transport", "nota", "ongkir", "bumbu", "kemasan", "plastik", "bamer", "baput", "terigu", "minyak", "cabe", "bahan", dll.
   - ATAU jika nama item yang ditulis cocok dengan "DAFTAR BAHAN BAKU (INGREDIENTS)".
   - Kategori:
     * Untuk Belanja Bahan Baku: Set ke kategori bahan baku tersebut (misal "Bumbu", "Bahan Utama", "Kemasan", "Belanja Bahan Baku") atau Kategori HPP Tambahan yang paling sesuai.
     * Untuk Operasional & Gaji: Set ke kategori pengeluaran resmi (misal "Gaji", "Operasional", "Biaya Iklan", "Tabungan", "Sewa").
   - WAJIB mengisi "materialId" dengan ID asli bahan baku tersebut jika ada di DAFTAR BAHAN BAKU.

3. **Penanganan Typo & Singkatan UMKM (Alias Mapping)**:
   - Cocokkan kata singkatan, typo, atau sebutan lokal user ke nama asli di Database:
     * "bamer" -> "Bawang Merah"
     * "baput" -> "Bawang Putih"
     * "baso" / "bso" -> "Bakso Sapi" / "Bakso Granat" / "Bakso"
     * "terigu" -> "Tepung Terigu"
     * "cabe" / "cabai" -> "Cabe Jablay" / "Cabe Merah"
     * "minyak" -> "Minyak Goreng"
     * "telor" / "telur" -> "Telur Ayam"
   - Hubungkan kata singkatan ini ke item asli yang ada di DAFTAR BAHAN BAKU.

4. **Dukungan Custom Qty & Harga User**:
   - Jika user menyebutkan KEDUA ANGKA sekaligus (Qty DAN Nominal/Harga, contoh: "bamer 2kg 50rb" atau "baput 500gr 15.000"), Anda WAJIB MENGGUNAKAN PERSIS angka Qty dan Nominal custom yang diinput user! JANGAN MENGUBAH ATAU MENIMPA ANGKA USER DENGAN PERHITUNGAN DATABASE!
   - Hitung Otomatis Hanya Jika Salah Satu Kosong:
     * Jika user HANYA menginput nominal/harga tanpa qty (misal "bamer 50000"), hitung qty_beli otomatis mengacu ke harga per unit di DB.
     * Jika user HANYA menginput qty tanpa nominal (misal "bamer 2kg"), hitung nominal otomatis mengacu ke harga per unit di DB.

5. **Multi-Transaksi**:
   - Jika user sebut banyak item (mis: "beli tapioka 25kg 210000, bamer 2kg 50rb, baput 1kg 30rb"):
     pisahkan menjadi transaksi tersendiri!

Aturan field per transaksi:
- "jenis": "Pemasukan" atau "Pengeluaran".
- "kategori": nama kategori resmi dari daftar kategori / HPP / kategori bahan baku.
- "tanggal": YYYY-MM-DD.
- "nominal": angka rupiah bulat custom dari user jika ada, atau hasil hitungan DB jika kosong.
- "qty_beli": kuantitas fisik custom dari user jika ada, atau hasil hitungan DB jika kosong.
- "materialId": ID bahan baku dari DAFTAR BAHAN BAKU jika cocok.
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
