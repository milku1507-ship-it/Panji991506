# 📖 PANDUAN LENGKAP PENGGUNAAN CEUMILAN
### Dari A sampai Z — Semua Fitur, Semua Langkah

---

## DAFTAR ISI

1. [Pertama Kali Masuk (Onboarding)](#1-pertama-kali-masuk)
2. [Pengaturan Toko](#2-pengaturan-toko)
3. [Manajemen HPP (Harga Pokok Produksi)](#3-manajemen-hpp)
4. [Manajemen Stok](#4-manajemen-stok)
5. [Catat Transaksi Manual](#5-catat-transaksi-manual)
6. [Catat Transaksi dengan AI Chat](#6-catat-transaksi-dengan-ai-chat)
7. [Quick Entry — Input Kilat](#7-quick-entry)
8. [Import Data dari Shopee / TikTok](#8-import-shopee--tiktok)
9. [Dashboard — Pantau Bisnis Setiap Hari](#9-dashboard)
10. [Laporan Keuangan & Export Excel](#10-laporan-keuangan)
11. [Kalkulator ROAS (Return on Ad Spend)](#11-kalkulator-roas)
12. [Fitur Paste HPP Otomatis (AI)](#12-paste-hpp-otomatis)
13. [Pengaturan Kategori & Unit](#13-pengaturan-kategori--unit)
14. [Tips & Alur Penggunaan Harian](#14-tips--alur-harian)

---

## 1. PERTAMA KALI MASUK

### Cara Login
1. Buka aplikasi CeuMilan di browser
2. Klik tombol **"Masuk ke [nama toko]"**
3. Pilih akun Google kamu
4. Selesai — data kamu otomatis tersimpan di cloud dan bisa diakses dari perangkat manapun

> 💡 **Catatan:** Jika dibuka di dalam preview/iframe (misal Replit), klik "Buka di Tab Baru" dulu sebelum login.

### Pilihan Saat Pertama Masuk (Onboarding)
Saat belum ada data sama sekali, kamu akan melihat 2 pilihan:

**Pilihan A — Mulai dari Nol (Mulai Input HPP)**
- Langsung masuk ke modul HPP untuk input produk kamu sendiri
- Cocok untuk yang mau setup dari awal sesuai usaha nyata

**Pilihan B — Gunakan Data Contoh**
- Mengisi aplikasi dengan data produk, stok, dan transaksi contoh
- Cocok untuk yang mau eksplorasi fitur dulu sebelum input data asli

---

## 2. PENGATURAN TOKO

**Cara akses:** Klik ikon ⚙️ Pengaturan di menu bawah

### 2.1 Profil Toko
- **Nama Toko** — nama yang muncul di halaman login dan header aplikasi
- **Tagline** — kalimat singkat di bawah nama toko
- **Alamat** — alamat usaha kamu
- **Logo Toko** — upload gambar logo (otomatis dikompres agar hemat storage)

> 💡 Logo mendukung format JPG, PNG, WebP. Ukuran besar pun oke karena otomatis dikompres.

### 2.2 Kustomisasi Struk/Nota
- Toggle **tampilkan logo** di struk: aktif/nonaktif
- Toggle **tampilkan nama toko** di struk
- Toggle **tampilkan alamat** di struk
- **Footer struk** — tambahkan pesan custom di bawah nota (mis: "Terima kasih sudah belanja!")

### 2.3 Kategori HPP
- Kelola kelompok bahan baku kamu (contoh: Material Utama, Kemasan, Overhead, Lainnya)
- Bisa tambah kategori baru, edit nama, hapus, dan **ubah urutannya** (drag atau tombol atas-bawah)
- Urutan kategori ini menentukan urutan tampilan bahan di HPP

### 2.4 Kategori Transaksi
- Kelola kategori pemasukan dan pengeluaran (contoh: Penjualan, Gaji, Operasional, Bahan Baku)
- Kategori yang kamu buat di sini muncul sebagai pilihan saat input transaksi

### 2.5 Satuan Unit
- Kelola satuan pengukuran bahan (gram, kg, ml, liter, pcs, dll)
- Bisa tambah satuan custom sesuai kebutuhanmu

---

## 3. MANAJEMEN HPP

**Cara akses:** Klik menu **HPP** di navigasi bawah

HPP adalah inti dari CeuMilan. Di sini kamu mendefinisikan berapa biaya untuk membuat setiap produkmu.

### 3.1 Struktur HPP
HPP menggunakan struktur 3 level:
```
Produk
  └── Varian (mis: Ukuran S, M, L / Rasa Original, Keju)
        └── Bahan/Komponen (mis: Tepung, Kemasan, Stiker)
```

### 3.2 Tambah Produk Baru
1. Di halaman HPP, klik tombol **"+ Produk"**
2. Isi nama produk
3. (Opsional) Isi deskripsi
4. (Opsional) Isi SKU produk
5. (Opsional) Isi **Biaya Lain** — biaya platform/pajak yang dipotong otomatis saat ada transaksi penjualan (contoh: komisi marketplace 5%)
6. Klik Simpan

### 3.3 Tambah Varian Produk
1. Buka produk yang sudah dibuat
2. Klik **"+ Varian"**
3. Isi:
   - **Nama Varian** (mis: Original, Pedas, Ukuran 250gr)
   - **Harga Jual** per pcs
   - **Qty per Batch** — berapa pcs yang dihasilkan dari 1 kali produksi
   - **Biaya Packing** — biaya kemasan yang dimasukkan ke HPP
   - (Opsional) SKU varian
4. Klik Simpan

### 3.4 Tambah Bahan/Komponen HPP
1. Buka varian yang sudah dibuat
2. Klik **"+ Tambah Komponen"**
3. Isi:
   - **Nama Bahan** — bisa pilih dari daftar bahan yang sudah ada, atau ketik nama baru
   - **Kelompok** — pilih kategori (Material Utama, Kemasan, Overhead, dll)
   - **Qty** — jumlah bahan yang dipakai per batch
   - **Satuan** — pilih satuan (gram, kg, ml, pcs, dll)
   - **Harga per satuan** — harga beli bahan tersebut
4. Klik Simpan

> 💡 **Konversi Unit Otomatis:** Kamu bisa input dalam gram, CeuMilan otomatis konversi ke kg jika perlu, dan sebaliknya. Tidak perlu hitung manual.

> 💡 **Sinkron ke Stok:** Setiap bahan yang kamu masukkan di HPP otomatis terdaftar di Manajemen Stok. Kamu tidak perlu input ulang.

### 3.5 Cara Baca Hasil HPP
Setelah semua bahan diisi, kamu akan melihat:
- **HPP per Pcs** = (Total biaya semua bahan + biaya packing) ÷ qty per batch
- **Harga Jual** yang kamu set
- **Margin / Laba per Pcs** = Harga Jual − HPP per Pcs
- **Margin %** = (Laba / Harga Jual) × 100

### 3.6 Edit Nama / Harga Bahan
- Klik nama bahan untuk edit
- Jika kamu **rename** sebuah bahan, semua produk dan varian lain yang pakai bahan yang sama akan otomatis ikut terupdate
- Jika kamu **ubah harga** bahan, HPP semua produk yang pakai bahan itu langsung berubah

### 3.7 Hapus Bahan dari HPP
1. Klik ikon hapus di sebelah nama bahan
2. Konfirmasi penghapusan
3. Bahan tersebut juga akan dihapus dari Stok (jika tidak dipakai produk lain)

### 3.8 Hapus Semua Bahan dalam Satu Kelompok
- Klik ikon hapus di judul kelompok (mis: "Kemasan")
- Semua bahan dalam kelompok itu terhapus sekaligus dari HPP dan Stok

### 3.9 Salin Daftar Bahan (Copy)
- Klik tombol **"Salin"** di halaman HPP varian
- Daftar bahan beserta harga tersalin ke clipboard dalam format teks rapi
- Bisa langsung di-paste ke WA, Notes, atau dokumen lain

---

## 4. MANAJEMEN STOK

**Cara akses:** Klik menu **Stok** di navigasi bawah

### 4.1 Tampilan Stok
Daftar semua bahan baku yang kamu miliki, menampilkan:
- Nama bahan
- Stok saat ini vs stok minimum
- Progress bar (merah jika mendekati habis)
- Nilai nominal stok = stok saat ini × harga per satuan

### 4.2 Edit Bahan di Stok
1. Klik nama bahan atau ikon edit
2. Yang bisa diubah:
   - **Nama bahan**
   - **Kategori** bahan
   - **Satuan**
   - **Harga per satuan** (akan update HPP semua produk yang pakai)
   - **Stok awal** (initialStock)
   - **Stok minimum** — batas peringatan stok hampir habis
3. Klik Simpan

### 4.3 Update Stok Manual
- Klik tombol **+** atau **−** di sebelah stok untuk tambah/kurangi jumlah
- Bisa juga langsung edit angka stok

### 4.4 Riwayat Transaksi Bahan
- Di dalam dialog edit bahan, ada tab **Riwayat**
- Menampilkan 10 transaksi terakhir yang mempengaruhi stok bahan ini
- Termasuk tanggal, jenis transaksi, dan jumlah perubahan stok

### 4.5 Kosongkan Semua Stok
- Tombol **"Kosongkan Qty"** — mengatur semua stok ke 0
- Metadata (nama, harga, kategori) tetap tersimpan
- Berguna saat mau hitung ulang stok dari awal

### 4.6 Peringatan Stok Rendah
- Bahan yang stoknya ≤ batas minimum muncul dengan indikator merah
- Juga muncul di **Dashboard** sebagai notifikasi scroll horizontal

---

## 5. CATAT TRANSAKSI MANUAL

**Cara akses:** Klik menu **Transaksi** → klik **"+ Transaksi"**

### 5.1 Transaksi Pemasukan (Penjualan)
1. Pilih jenis: **Pemasukan**
2. Pilih kategori: **Penjualan** (atau kategori lain sesuai kebutuhan)
3. Jika "Penjualan":
   - Pilih **produk** yang dijual
   - Pilih **varian** produk
   - Masukkan **jumlah (qty)** yang terjual
   - Nominal otomatis terhitung dari harga jual × qty
   - Bisa tambah produk/varian lain dalam 1 transaksi yang sama
4. Pilih **tanggal** transaksi
5. (Opsional) Isi keterangan
6. Klik **Simpan**

> 💡 **Stok Otomatis Berkurang:** Saat transaksi penjualan disimpan, stok semua bahan yang dipakai untuk produk tersebut otomatis berkurang sesuai HPP × qty terjual.

> 💡 **Biaya Lain Otomatis:** Jika produk punya "Biaya Lain" (komisi platform/pajak), otomatis dipotong dari nominal pemasukan bersih.

### 5.2 Transaksi Pemasukan Lainnya (Non-Penjualan)
1. Pilih jenis: **Pemasukan**
2. Pilih kategori selain "Penjualan" (misal: Jasa, Titip Jual, dll)
3. Isi nominal
4. Pilih tanggal & keterangan
5. Simpan

### 5.3 Transaksi Pengeluaran (Pembelian Bahan)
1. Pilih jenis: **Pengeluaran**
2. Pilih kategori (misal: Bahan Baku, Operasional, dll)
3. Jika kategori terkait bahan baku:
   - Bisa pilih **bahan spesifik** dari daftar stok
   - Isi qty yang dibeli dan satuan
   - **Stok otomatis bertambah** saat disimpan
4. Isi nominal total pengeluaran
5. Pilih tanggal & keterangan
6. Simpan

### 5.4 Edit Transaksi
- Di daftar transaksi, klik transaksi yang mau diedit
- Ubah field yang perlu diubah
- Simpan perubahan

### 5.5 Hapus Transaksi
**Hapus 1 transaksi:**
- Klik transaksi → klik ikon hapus → konfirmasi

**Hapus banyak sekaligus (Bulk Delete):**
1. Klik tombol **"Pilih"** di halaman transaksi
2. Centang transaksi yang mau dihapus (bisa centang semua sekaligus)
3. Klik **"Hapus"**
4. Konfirmasi

### 5.6 Filter & Cari Transaksi
- **Filter periode** — pilih hari ini, minggu ini, bulan ini, atau custom
- **Filter kategori** — tampilkan hanya jenis transaksi tertentu
- **Pencarian** — cari berdasarkan keterangan/nama produk

---

## 6. CATAT TRANSAKSI DENGAN AI CHAT

**Cara akses:** Di halaman Transaksi → klik ikon 💬 **AI Chat**

### 6.1 Cara Kerja
Kamu bisa ketik kalimat natural dalam Bahasa Indonesia, AI akan:
- Mengenali jenis transaksi (pemasukan/pengeluaran)
- Mencocokkan nama produk dan varian ke katalog HPP kamu
- Mengisi tanggal, nominal, kategori secara otomatis
- Menampilkan preview sebelum disimpan

### 6.2 Contoh Kalimat yang Bisa Dipakai
```
"jual cireng ayam ori 50 pcs dan keju 30 pcs"
"beli tepung terigu 5kg 45000 sama garam 1kg 8000"
"tgl kemarin jual produk A varian premium 10 pcs"
"beli gas 3kg 25rb, sabun cuci 2 btl 15000, plastik kemasan 100 pcs 50000"
"tanggal 15 jual paket hemat 20, paket premium 5"
```

### 6.3 Alur Penggunaan AI Chat
1. Ketik pesan di kolom chat bawah
2. AI memproses dan menampilkan **preview kartu transaksi**
3. Cek detail di setiap kartu (tanggal, nominal, kategori, produk)
4. Jika ada yang kurang tepat, ketik koreksi di chat
5. Jika sudah benar, klik **"Simpan Semua"**
6. Semua transaksi tersimpan sekaligus ke database

### 6.4 Multi-Transaksi Sekaligus
- Satu kalimat bisa menghasilkan beberapa transaksi berbeda
- AI otomatis memisahkan: "beli tepung dan garam" → 2 transaksi pengeluaran terpisah
- Untuk penjualan produk sama dengan varian berbeda → digabung jadi 1 transaksi multi-varian

### 6.5 Klarifikasi AI
Jika AI tidak yakin dengan input kamu, ia akan mengirim pertanyaan klarifikasi. Jawab pertanyaannya, lalu AI akan coba parse ulang.

---

## 7. QUICK ENTRY

**Cara akses:** Klik ikon ⚡ **Quick Entry** (shortcut di Dashboard atau menu)

### 7.1 Cara Kerja
Quick Entry adalah cara tercepat input transaksi tanpa AI — pakai format singkat dengan kata kunci.

### 7.2 Format Penulisan
```
[tanggal] [kata kunci] [keterangan] [nominal]
```

**Kata kunci tanggal:**
- `hari ini` / (kosong) → hari ini
- `kemarin` → kemarin
- `tgl 15` / `15/6` → tanggal spesifik

**Kata kunci jenis:**
- `jual` / `masuk` → Pemasukan
- `beli` / `keluar` / `bayar` → Pengeluaran

**Contoh:**
```
jual cireng 150000
kemarin beli gas 25000
tgl 10 bayar listrik 85000
beli tepung terigu 5kg 45000
```

### 7.3 Batch Input
Tulis beberapa baris sekaligus, satu baris = satu transaksi:
```
jual cireng ori 150000
jual cireng keju 200000
beli tepung 45000
beli gas 25000
```
Klik **"Simpan Semua"** → semua tersimpan sekaligus.

---

## 8. IMPORT SHOPEE / TIKTOK

**Cara akses:** Halaman Transaksi → ikon **Import** (atas kanan)

### 8.1 Yang Didukung
- File Excel (.xlsx) dari laporan penjualan **Shopee**
- File Excel (.xlsx) dari laporan penjualan **TikTok Shop**
- Format marketplace lain yang punya kolom SKU, Qty, Total

### 8.2 Langkah Import
1. Download laporan penjualan dari dashboard Shopee/TikTok dalam format Excel
2. Di CeuMilan, klik ikon Import
3. Upload file Excel tersebut
4. CeuMilan otomatis mendeteksi kolom (SKU, Nama Produk, Qty, Total)
5. Sistem melakukan **pencocokan produk** — SKU atau nama produk dicocokkan ke katalog HPP kamu
6. Preview hasil import ditampilkan
7. Kamu bisa cek dan konfirmasi sebelum disimpan
8. Klik **"Import Semua"** — semua transaksi dari file tersimpan sekaligus

### 8.3 Tips Import
- Pastikan SKU di Shopee/TikTok sama dengan SKU yang kamu set di HPP CeuMilan untuk pencocokan akurat
- Jika nama produk tidak cocok 100%, sistem tetap melakukan fuzzy matching (pencocokan mendekati)
- Duplikat transaksi yang sudah ada tidak akan diimport ulang

---

## 9. DASHBOARD

**Cara akses:** Klik menu **Beranda** / ikon 🏠

Dashboard adalah pusat informasi bisnis kamu setiap hari.

### 9.1 Kartu Ringkasan (Stats)
- **Saldo Laba** — laba bersih periode yang dipilih (Pemasukan − Pengeluaran)
- **Total Pemasukan** — total semua pemasukan
- **Total Pengeluaran** — total semua pengeluaran
- **Margin %** — persentase laba dari total pemasukan

### 9.2 Filter Periode
Klik dropdown periode di atas untuk memilih:
- Hari ini
- Kemarin
- 7 hari terakhir
- Bulan ini
- Bulan lalu
- Custom (pilih tanggal sendiri)

> 💡 Filter periode di Dashboard **terhubung** dengan halaman Transaksi dan Laporan. Mengubahnya di satu tempat = berubah di semua halaman.

### 9.3 Grafik Penjualan 7 Hari
- Area chart yang menampilkan tren pemasukan harian selama 7 hari terakhir
- Berguna untuk lihat hari mana yang paling ramai / sepi

### 9.4 Peringatan Stok Rendah
- Scrollable horizontal list menampilkan bahan yang stoknya ≤ batas minimum
- Klik item untuk langsung ke halaman stok

### 9.5 Aktivitas Terbaru
- 6 transaksi terbaru ditampilkan di feed
- Dengan ikon warna (hijau = pemasukan, merah = pengeluaran) dan nominal

### 9.6 Tombol Aksi Cepat
- **+ Transaksi** — langsung ke form tambah transaksi
- **Stok** — ke halaman manajemen stok
- **HPP** — ke halaman HPP
- **Riwayat** — ke daftar semua transaksi

---

## 10. LAPORAN KEUANGAN

**Cara akses:** Klik menu **Laporan** di navigasi bawah

### 10.1 Ringkasan Finansial
- Total Pemasukan, Pengeluaran, dan Laba Bersih untuk periode yang dipilih
- **Margin bersih** dalam persen
- Jumlah transaksi pemasukan dan pengeluaran

### 10.2 Grafik Distribusi Pengeluaran
- Pie chart yang menampilkan alokasi biaya per kategori pengeluaran
- Contoh: 40% Bahan Baku, 25% Operasional, 20% Gaji, dll
- Berguna untuk tahu biaya mana yang paling besar

### 10.3 Tabel Performa Produk
Tabel rinci per produk dan varian:
- **Qty Terjual** — total unit yang berhasil dijual
- **Gross Revenue** — pemasukan kotor sebelum biaya
- **Net Revenue** — pemasukan setelah biaya platform/pajak
- **Total HPP** — total biaya produksi dari semua unit terjual
- **Laba Bersih** — Net Revenue − Total HPP
- **Margin %** — profitabilitas per produk

### 10.4 Export ke Excel
1. Klik tombol **"Export Excel"**
2. File .xlsx otomatis ter-download
3. File berisi laporan lengkap dengan header tebal dan kolom yang sudah diformat rapi
4. Cocok untuk laporan ke akuntan, investor, atau arsip pribadi

### 10.5 Filter Laporan
- Filter periode sama dengan Dashboard (terhubung)
- Bisa filter per kategori transaksi
- Data selalu real-time dari Firestore

---

## 11. KALKULATOR ROAS

**Cara akses:** Di halaman HPP varian → tab **ROAS** atau icon kalkulator

### 11.1 Apa itu ROAS?
ROAS = Return on Ad Spend. Angka minimum agar biaya iklan kamu tidak merugi.

### 11.2 Input yang Dibutuhkan
- **Harga Jual** — otomatis terisi dari HPP varian
- **HPP per Pcs** — otomatis dari kalkulasi HPP
- **Voucher/Diskon** — jika ada promo yang kamu tanggung
- **Biaya Lain** — komisi marketplace, ongkir, dll
- **Min. Order** — jumlah minimum pembelian (untuk mode Per Order)

### 11.3 Hasil Kalkulasi
- **Gross Profit (H)** = (Harga Jual − Voucher) − (HPP + Biaya Lain)
- **Min. ROAS (J)** = Break-even ROAS termasuk kalkulasi PPN 11%
- **Insight otomatis** — CeuMilan memberikan peringatan jika:
  - Margin terlalu tipis untuk scale dengan iklan
  - Target ROAS yang kamu set tidak realistis
  - Harga jual perlu dinaikkan agar bisnis layak diiklankan

### 11.4 Mode Per Pcs vs Per Order
- Toggle **Per Pcs** — kalkulasi untuk 1 unit produk
- Toggle **Per Order** — kalkulasi dikalikan min. order (untuk bundle/grosir)

---

## 12. PASTE HPP OTOMATIS (AI)

**Cara akses:** Di halaman HPP varian → tombol **"Paste HPP"**

### 12.1 Fungsi
Fitur ini menggunakan AI untuk membaca teks HPP dari manapun (WhatsApp, catatan, dokumen) dan otomatis mengisi bahan-bahan ke HPP varian.

### 12.2 Cara Penggunaan
1. Salin teks HPP dari sumber manapun (WA, Notes, PDF, dll)
2. Di CeuMilan, buka varian produk yang mau diisi
3. Klik **"Paste HPP"**
4. Paste teks di kolom yang tersedia
5. Klik **"Parse HPP"**
6. AI membaca dan mengekstrak:
   - Nama varian (jika ada)
   - Qty per batch
   - Harga jual
   - Semua bahan beserta qty, satuan, dan harga
7. Tampil **preview hasil parsing**
8. Kamu bisa edit jika ada yang kurang tepat
9. Klik **"Terapkan"** — semua bahan langsung masuk ke HPP

### 12.3 Format Teks yang Bisa Dibaca AI
AI cukup cerdas membaca berbagai format, contoh:
```
Varian: Cireng Ayam Ori
Qty/Batch: 50 pcs
Harga Jual: Rp 5.000

Material Utama:
- Tepung Tapioka: 500gr × Rp 14.000/kg = Rp 7.000
- Ayam Cincang: 200gr × Rp 45.000/kg = Rp 9.000

Kemasan:
- Plastik: 1 pcs × Rp 300 = Rp 300
- Stiker: 1 lembar × Rp 200 = Rp 200
```

---

## 13. PENGATURAN KATEGORI & UNIT

**Cara akses:** Menu **Pengaturan** → tab Kategori / Satuan

### 13.1 Kategori HPP
- Tambah kelompok bahan baru (tombol "+")
- Edit nama kelompok yang sudah ada
- Hapus kelompok (bahan dalam kelompok tersebut akan dikategorikan ulang)
- **Atur urutan** — klik panah atas/bawah untuk ubah posisi kelompok
- Urutan ini menentukan tampilan di halaman HPP

### 13.2 Kategori Transaksi
- Kelola kategori Pemasukan (mis: Penjualan, Jasa, Titip Jual)
- Kelola kategori Pengeluaran (mis: Bahan Baku, Gaji, Operasional, Listrik)
- Kategori ini muncul saat input transaksi manual

### 13.3 Satuan Unit
- Tambah satuan baru yang relevan dengan produkmu
- Edit atau hapus satuan yang tidak terpakai
- Satuan yang kamu tambah muncul sebagai pilihan di form HPP

---

## 14. TIPS & ALUR PENGGUNAAN HARIAN

### 📋 Alur Setup Awal (Lakukan Sekali)
```
1. Setting nama & logo toko
2. Setting kategori HPP (sesuaikan dengan jenis bahan kamu)
3. Setting kategori transaksi (sesuaikan dengan jenis biaya kamu)
4. Input semua produk di HPP
5. Input semua varian per produk
6. Input semua bahan per varian (lengkap dengan qty, satuan, harga)
7. Set stok minimum untuk setiap bahan di Stok
8. Set stok awal / stok saat ini di Stok
```

### 📅 Alur Harian yang Direkomendasikan
```
Pagi:
- Buka Dashboard → cek laba kemarin, stok mana yang hampir habis

Saat Ada Penjualan:
- Catat via AI Chat / Quick Entry / Form Manual
- Stok otomatis berkurang

Saat Beli Bahan:
- Catat sebagai Pengeluaran → pilih bahan → stok otomatis bertambah

Akhir Hari:
- Cek Dashboard → pastikan semua transaksi sudah tercatat
- Cek Stok → bahan mana yang perlu dibeli besok

Akhir Bulan:
- Buka Laporan → cek performa per produk
- Export Excel jika perlu laporan tertulis
```

### 💡 Tips Penting
1. **Selalu input HPP dulu** sebelum catat transaksi penjualan — agar stok bisa terkurangi dengan benar
2. **Gunakan AI Chat untuk input cepat** — jauh lebih efisien dari form manual jika kamu sudah familiar
3. **Set stok minimum** untuk semua bahan — agar dapat peringatan sebelum kehabisan
4. **Cek Dashboard setiap hari** — bisnis yang sehat butuh monitoring rutin
5. **SKU yang konsisten** — jika jual di Shopee/TikTok, pastikan SKU di CeuMilan sama dengan di marketplace untuk import otomatis
6. **Satu login = semua perangkat** — data kamu sync real-time, bisa akses dari HP, tablet, atau laptop sekaligus

### ❓ Pertanyaan Umum

**Q: Data saya aman?**
A: Ya. Semua data tersimpan di Firebase Firestore milik Google, terenkripsi, dan hanya bisa diakses dengan akun Google kamu.

**Q: Bisa dipakai offline?**
A: CeuMilan punya mode offline terbatas. Data yang sudah dimuat tetap bisa dilihat, tapi transaksi baru baru tersimpan saat koneksi kembali.

**Q: Bagaimana jika ganti HP?**
A: Login dengan akun Google yang sama → semua data langsung muncul.

**Q: Bisakah dipakai oleh beberapa orang/karyawan?**
A: Saat ini satu akun = satu login. Fitur multi-user belum tersedia.

**Q: Bisa import dari Excel/Google Sheets sendiri?**
A: Saat ini import hanya tersedia untuk format Shopee/TikTok. Input manual atau AI Chat untuk data lainnya.

---

## PENUTUP

CeuMilan dirancang agar pemilik UMKM bisa fokus pada produk dan penjualan — bukan terjebak di kalkulator dan spreadsheet.

Dengan HPP otomatis, stok yang update sendiri, AI yang bantu catat transaksi, dan laporan yang selalu siap — kamu punya semua yang dibutuhkan untuk jalankan bisnis dengan lebih cerdas.

---

*Panduan ini dibuat lengkap berdasarkan seluruh fitur CeuMilan.*
*Dibuat oleh: Panji Abdillah Al-gipari*
