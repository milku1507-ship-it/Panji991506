import { GoogleGenAI, Type } from '@google/genai';

export const HPP_SYSTEM_INSTRUCTION = `Anda adalah asisten parsing HPP (Harga Pokok Produksi) untuk aplikasi pembukuan UMKM Indonesia.

Tugas: Dari teks bebas yang user paste, ekstrak SATU varian produk lengkap dengan semua bahan bakunya, lalu kembalikan JSON terstruktur.

ATURAN PARSING VARIAN (top-level fields):
- "nama_varian": ambil dari baris seperti "Nama Varian: X", "Varian: X", atau judul utama. Jika tidak ada, kosongkan.
- "qty_batch": ambil dari "Qty/Batch", "Qty Batch", "Batch", "isi per batch". Default 1 jika tidak ada.
- "harga_jual": ambil dari "Harga Jual/pcs", "Harga Jual", "Jual". Angka dalam Rupiah (tanpa titik/koma). "14998"=14998, "Rp 25.000"=25000, "1,5jt"=1500000.
- "harga_packing": ambil dari "Packing/pack", "Harga Packing", "Packing per pack". Angka Rupiah.

ATURAN PARSING BAHAN BAKU (array "bahan"):
Format umum yang user pakai:
- "Tapioka: 2500 gram × Harga 10 = Rp 25.000" → nama="Tapioka", qty=2500, satuan="gram", harga_per_satuan=10
- "Bubble Wrap: 25 pcs × Harga 650 = Rp 16.250" → nama="Bubble Wrap", qty=25, satuan="pcs", harga_per_satuan=650
- "Garam 30gr (harga 600gr = 3.000)" → harga 3000 untuk 600gr berarti 5/gr, jadi qty=30, satuan="gram", harga_per_satuan=5
- "Daun Jeruk: 1 paket × Harga 500 = Rp 500" → nama="Daun Jeruk", qty=1, satuan="paket", harga_per_satuan=500

PENTING — Penentuan kelompok:
Teks biasanya dipisah menjadi section dengan judul bernomor:
- "1. Kulit Cireng" / "Kulit" → kelompok="Kulit Cireng"
- "2. Isian" / "Bahan Isian" → kelompok="Bahan Isian"
- "3. Packing" / "Packaging" → kelompok="Packing"
- "4. Overhead" / "Operasional" → kelompok="Overhead"
- Lainnya jika tidak jelas → kelompok="Lainnya"
Setiap bahan di bawah judul section dapat kelompok dari section tersebut.
Kelompok HARUS satu dari daftar yang diberikan di KATEGORI_TERSEDIA. Jika tidak cocok, gunakan "Lainnya".

PENTING — Satuan:
- Normalisasi: "gr"/"g"/"gram" → "gram"; "kg"/"kilogram" → "kg"; "ml"/"mililiter" → "ml"; "liter"/"l" → "liter"; "pcs"/"buah"/"biji" → "pcs"; "paket"/"pak" → "paket"; "lembar" → "lembar".
- Jangan ubah satuan asli ke base unit — kembalikan APA ADANYA seperti yang user tulis. Sistem akan menormalisasi nanti.

PENTING — Harga per satuan:
- Jika user tulis "X gram × Harga Y = Rp Z", maka harga_per_satuan = Y. JANGAN bagi atau kali lagi.
- Jika user hanya tulis total (mis. "Tapioka 2,5kg seharga Rp 25.000"), hitung harga_per_satuan = 25000 / 2.5 = 10000 per kg.
- Jika ada keterangan harga dalam jumlah berbeda seperti "Garam 30gr (harga 600gr = 3.000)", artinya 3000 untuk 600gr → 5 per gr. Pakai satuan asli (gr → gram).
- Output "harga_per_satuan" SELALU per satu unit dari "satuan" yang dikembalikan.

ATURAN UMUM:
- Abaikan baris yang bukan bahan baku (mis. "Berat isian: kulit 13gr" — itu info, bukan bahan).
- Jangan duplikasi bahan dengan nama sama di kelompok sama. Jika user sebut "Minyak Goreng" di "Kulit" dan di "Isian", buat 2 entry terpisah dengan kelompok berbeda.
- Nama bahan: rapikan kapitalisasi (mis. "BUBBLE WRAP" → "Bubble Wrap").
- Jika section tidak ada di KATEGORI_TERSEDIA, mapping ke yang paling mirip atau "Lainnya".

Output:
- "variant": { nama_varian, qty_batch, harga_jual, harga_packing }
- "bahan": array { nama, kelompok, qty, satuan, harga_per_satuan }
- "notes": catatan singkat dalam Bahasa Indonesia tentang apa yang tidak bisa di-parse atau perlu diperhatikan user.`;

export const hppResponseSchema = {
  type: Type.OBJECT,
  properties: {
    variant: {
      type: Type.OBJECT,
      properties: {
        nama_varian: { type: Type.STRING },
        qty_batch: { type: Type.NUMBER },
        harga_jual: { type: Type.NUMBER },
        harga_packing: { type: Type.NUMBER },
      },
      required: ['nama_varian'],
    },
    bahan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          nama: { type: Type.STRING },
          kelompok: { type: Type.STRING },
          qty: { type: Type.NUMBER },
          satuan: { type: Type.STRING },
          harga_per_satuan: { type: Type.NUMBER },
        },
        required: ['nama', 'kelompok', 'qty', 'satuan', 'harga_per_satuan'],
      },
    },
    notes: { type: Type.STRING },
  },
  required: ['variant', 'bahan'],
};

export async function runParseHpp(body: any) {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey) {
    throw new Error('AI integration belum dikonfigurasi.');
  }

  const { rawText, kategoriHpp = [], existingIngredients = [] } = body || {};

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Teks HPP tidak boleh kosong.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: baseUrl ? { apiVersion: '', baseUrl } : undefined,
  });

  const ingredientHints = existingIngredients
    .slice(0, 200)
    .map((i: any) => `- ${i.name} (${i.unit}, Rp ${i.price}/${i.unit})`)
    .join('\n');

  const context = `KATEGORI_TERSEDIA (kelompok yang valid):
${kategoriHpp.length > 0 ? kategoriHpp.map((c: string) => `- ${c}`).join('\n') : '- Kulit Cireng\n- Bahan Isian\n- Packing\n- Overhead\n- Lainnya'}

BAHAN BAKU YANG SUDAH PERNAH DIPAKAI (untuk inspirasi penamaan, bukan keharusan):
${ingredientHints || '(belum ada)'}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `KONTEKS APLIKASI:
${context}

TEKS HPP YANG DI-PASTE USER:
"""
${rawText}
"""

Tolong parse menjadi JSON sesuai schema.`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: HPP_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: hppResponseSchema as any,
    },
  });

  const text = response.text || '{}';
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    throw new Error('Gagal parsing respons AI. Coba lagi.');
  }
}
