# CeuMilan

Indonesian UMKM (small business) bookkeeping app: HPP, stock, transactions, financial reports, ROAS calculator, and an AI-assisted transaction input chat.

## Stack
- Vite 6 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (in `components/ui`)
- Firebase Auth (Google sign-in), Firestore, Firebase Storage — points at the user's existing Firebase project (`mila1507`)
- Gemini AI for natural-language transaction parsing, accessed through Replit AI Integrations (`AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL`)
- Express (`scripts/server.ts`) used for the production `npm run start` build to serve `dist/` and the AI endpoints (`/api/ai-parse`, `/api/parse-hpp`)
- Vite dev server uses `scripts/aiParseMiddleware.ts` to expose the same AI endpoints during development
- Firebase Auth handler is reverse-proxied: `/__/auth/*` and `/__/firebase/*` forward to `mila1507.firebaseapp.com` via `http-proxy-middleware` (prod) and Vite `server.proxy` (dev). `authDomain` is set dynamically to `window.location.host` so the entire OAuth redirect flow stays on a single origin — fixes "missing initial state" / storage-partitioning errors with `signInWithRedirect` on Chrome/Android
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
