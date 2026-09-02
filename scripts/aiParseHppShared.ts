import { GoogleGenAI, Type } from '@google/genai';

export const HPP_SYSTEM_INSTRUCTION = `Anda adalah asisten parsing HPP (Harga Pokok Produksi) untuk aplikasi pembukuan UMKM Indonesia.

Tugas: Dari teks bebas yang user paste, ekstrak SATU varian produk lengkap dengan semua bahan bakunya, lalu kembalikan JSON terstruktur.

ATURAN PARSING VARIAN (top-level fields):
- "nama_varian": ambil dari baris seperti "Nama Varian: X", "Varian: X", atau judul utama. Jika tidak ada, kosongkan.
- "qty_batch": ambil dari "Qty/Batch", "Qty Batch", "Batch", "isi per batch". Default 1 jika tidak ada.
- "harga_jual": ambil dari "Harga Jual/pcs", "Harga Jual", "Jual". Angka dalam Rupiah (tanpa titik/koma). "14998"=14998, "Rp 25.000"=25000, "1,5jt"=1500000.
- "harga_packing": ambil dari "Gaji/pack", "Gaji / pack", "Upah/pack", "Packing/pack", "Harga Packing", "Packing per pack". Angka Rupiah.

ATURAN PARSING KOMPONEN (array "bahan"):
Format umum yang user pakai:
- "Kain Cotton: 2 meter × Harga 25000 = Rp 50.000" → nama="Kain Cotton", qty=2, satuan="meter", harga_per_satuan=25000
- "Kemasan: 1 pcs × Harga 2000 = Rp 2.000" → nama="Kemasan", qty=1, satuan="pcs", harga_per_satuan=2000
- "Benang 50m (harga 200m = 4.000)" → harga 4000 untuk 200m berarti 20/m, jadi qty=50, satuan="meter", harga_per_satuan=20
- "Stiker Label: 1 lembar × Harga 300 = Rp 300" → nama="Stiker Label", qty=1, satuan="lembar", harga_per_satuan=300

PENTING — Penentuan kelompok:
Teks biasanya dipisah menjadi section dengan judul bernomor:
- "1. Material Utama" / "Bahan Utama" → kelompok="Material Utama"
- "2. Material Pendukung" / "Komponen" → kelompok="Material Pendukung"
- "3. Kemasan" / "Packing" / "Packaging" → kelompok="Kemasan"
- "4. Overhead" / "Operasional" → kelompok="Overhead"
- Lainnya jika tidak jelas → kelompok="Lainnya"
Setiap komponen di bawah judul section dapat kelompok dari section tersebut.
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
- Abaikan baris yang bukan komponen biaya (mis. "Catatan: cek kualitas" — itu info, bukan komponen).
- Jangan duplikasi komponen dengan nama sama di kelompok sama. Jika user sebut bahan yang sama di dua section berbeda, buat 2 entry terpisah dengan kelompok berbeda.
- Nama komponen: rapikan kapitalisasi (mis. "KAIN COTTON" → "Kain Cotton").
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
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
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
${kategoriHpp.length > 0 ? kategoriHpp.map((c: string) => `- ${c}`).join('\n') : '- Material Utama\n- Material Pendukung\n- Kemasan\n- Overhead\n- Lainnya'}

KOMPONEN YANG SUDAH PERNAH DIPAKAI (untuk inspirasi penamaan, bukan keharusan):
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
