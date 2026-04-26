# CeuMilan

Indonesian UMKM (small business) bookkeeping app: HPP, stock, transactions, financial reports, ROAS calculator, and an AI-assisted transaction input chat.

## Stack
- Vite 6 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (in `components/ui`)
- Firebase Auth (Google sign-in), Firestore, Firebase Storage — points at the user's existing Firebase project (`mila1507`)
- Gemini AI for natural-language transaction parsing, accessed through Replit AI Integrations (`AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL`)
- Express (`scripts/server.ts`) used for the production `npm run start` build to serve `dist/` and the `/api/ai-parse` endpoint
- Vite dev server uses `scripts/aiParseMiddleware.ts` to expose `/api/ai-parse` during development

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
