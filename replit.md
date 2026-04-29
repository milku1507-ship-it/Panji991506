# CeuMilan

Indonesian UMKM (small business) bookkeeping app: HPP, stock, transactions, financial reports, ROAS calculator, and an AI-assisted transaction input chat.

## Stack
- Vite 6 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (in `components/ui`)
- Firebase Auth (Google sign-in), Firestore, Firebase Storage — points at the user's existing Firebase project (`mila1507`)
- Gemini AI for natural-language transaction parsing, accessed through Replit AI Integrations (`AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL`)
- Express (`scripts/server.ts`) used for the production `npm run start` build to serve `dist/` and the AI endpoints (`/api/ai-parse`, `/api/parse-hpp`)
- Vite dev server uses `scripts/aiParseMiddleware.ts` to expose the same AI endpoints during development
- Firebase Auth handler is reverse-proxied: `/__/auth/*` and `/__/firebase/*` forward to `mila1507.firebaseapp.com` via `http-proxy-middleware` (prod) and Vite `server.proxy` (dev). `authDomain` defaults to `mila1507.firebaseapp.com` (Firebase's auto-created OAuth client already whitelists `https://mila1507.firebaseapp.com/__/auth/handler`), so login works on any Replit deployment URL without having to add a redirect URI in Google Cloud Console — only the page's domain needs to be added to Firebase Authorized Domains. Set `VITE_FIREBASE_AUTH_DOMAIN=<current-host>` to bring back single-origin behaviour if storage partitioning ever bites again
- `/api/parse-hpp` (`scripts/aiParseHppShared.ts`) powers the "Paste Otomatis" smart-input on the HPP variants page — turns free-text HPP notes into a structured variant + bahan list grouped by kelompok

## Layout
- `src/` — React app (App, components, lib, constants, types, SettingsContext)
- `components/ui/` — shadcn/ui primitives, imported via `@/components/ui/*`
- `lib/` — shared `utils.ts` (the `@` alias resolves to the project root)
- `scripts/` — server entry, Vite middleware, image utilities
- `public/` — icons, manifest
- `firebase-applet-config.json` — Firebase config used as the default

## Run / Build
- Dev: `npm run dev` (workflow `Start application`, port 5000)
- Build: `npm run build`
- Prod: `npm run start` (Express serves `dist/` + `/api/ai-parse`)

## Replit migration notes
- Dependencies installed and the dev workflow is healthy on port 5000.
- Gemini calls go through Replit AI Integrations — no user-supplied key required.
- Firebase Auth + Firestore + Storage are intentionally preserved; the entire data layer (real-time listeners, batches, storage uploads) is wired to the user's own Firebase project.

## Konsistensi Dashboard ↔ Transaksi ↔ Laporan
- Single source of truth untuk semua perhitungan ada di `src/lib/transactionStats.ts` (`filterByDateRange`, `computeStats`, `isValidTransaction`, `getPresetRange`). Halaman Dashboard (`Dashboard.tsx`), Transaksi (`TransactionManager.tsx`), dan Laporan (`FinancialReport.tsx`) dilarang menghitung pemasukan/pengeluaran/saldo dengan rumus sendiri.
- Filter periode bersama disediakan oleh `src/lib/dateFilterContext.tsx` (`DateFilterProvider` + `useDateFilter`). Default "Bulan Ini". Ketiga halaman membaca state filter yang sama — mengubah periode di salah satu halaman ikut mengubah halaman lain, angka selalu identik. Preset yang didukung: `Hari Ini`, `Minggu Ini`, `Bulan Ini`, `Tahun Ini`, `Semua Waktu`, `Custom`. Dashboard menampilkan subset (`DASHBOARD_PRESETS`); Transaksi/Laporan menampilkan semua.
- `computeStats` mendaftarkan hasil ke registry dan emit `window` event `stats:mismatch` jika total antar halaman (Dashboard/Transaksi/Laporan) berbeda untuk range yang sama. `App.tsx` mendengarkan event itu dan menampilkan `toast.warning('Data tidak sinkron, periksa filter atau transaksi')` (cooldown 5 detik supaya tidak spam).
- Validasi transaksi (`isValidTransaction`): wajib punya tanggal valid, jenis Pemasukan/Pengeluaran, dan nominal > 0. Data corrupt/null otomatis di-skip lewat `filterByDateRange`.
- Real-time: data datang dari satu listener Firestore `onSnapshot` di `App.tsx` lalu di-pass ke ketiga halaman, jadi tambah/edit/hapus langsung mereflect tanpa cache lama.
- Debug log: `computeStats` mencetak `[STATS:Dashboard]`, `[STATS:Transaksi]`, dan `[STATS:Laporan]` ke console (filter range, jumlah transaksi, total pemasukan/pengeluaran/saldo) sehingga bisa langsung dibandingkan.
- Label periode aktif (`rangeLabel`) ditampilkan di setiap halaman ("Saldo Laba · Bulan Ini", "Total Saldo · Bulan Ini", "Laba Bersih (Bulan Ini)") supaya pengguna tahu angka yang dilihat berasal dari rentang mana.
