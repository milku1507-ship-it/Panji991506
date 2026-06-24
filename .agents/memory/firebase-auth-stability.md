---
name: Firebase Auth Stability Fixes
description: Root causes and fixes for "missing initial state", random logout loops, and dirty logout in Replit+Firebase apps.
---

## The Four Root Causes

### 1. Split persistence bug (caused "login mental" / random logouts)
`firebase.ts` was switching persistence backend based on `window.self !== window.top`:
- iframe → `indexedDBLocalPersistence`
- top-level tab → `browserLocalPersistence`

These are separate storage buckets. Token written in one context wasn't found in the other → user appeared logged out on refresh.

**Fix:** Always use `[indexedDBLocalPersistence, browserLocalPersistence]` as a fallback chain — Firebase tries IndexedDB first in all contexts, falls back to localStorage. No iframe detection needed.

### 2. "Missing initial state" — caused by signInWithRedirect
`signInWithRedirect` stores OAuth nonce/state in `sessionStorage`. If the page URL changes between Replit deployments (or sessionStorage is partitioned), the nonce is gone on return → error.

**Fix:** Never use `signInWithRedirect`. Use `signInWithPopup` exclusively. For iframes (Replit preview), show "open in new tab" button.

### 3. Dirty logout left stale OAuth state
`signOut(auth)` only revokes the Firebase token. It doesn't clear sessionStorage nonces that `signInWithRedirect` left behind. Next login found them → "missing initial state".

**Fix:** `handleLogout` in App.tsx now:
1. `sessionStorage.clear()` (removes nonces)
2. Removes `firebase:pending*` and `firebase:authEvent*` localStorage keys
3. Removes app cache keys (`SETTINGS_CACHE_KEY`, `cireng_store_settings`)
4. Calls `signOut(auth)`

### 4. `getRedirectResult` on every LoginPage mount
Called on every render — could return stale results from previous redirect, conflict with popup flows.

**Fix:** Removed entirely from `LoginPage.tsx`. We don't use redirect, so no redirect result to check.

## Other Changes
- `googleProvider.setCustomParameters({ prompt: 'select_account' })` — forces fresh account picker every time, prevents cached credential conflicts.
- Logout handler lifted from `Layout.tsx` to `App.tsx` (comprehensive cleanup); Layout accepts `onLogout` prop.

**Why:** `signOut()` alone is insufficient for clean re-login. Must clear both sessionStorage and Firebase redirect-state localStorage keys before the next login attempt.

**How to apply:** Any future auth changes must keep the persistence as a fallback chain array. Never switch based on iframe detection. Always clear sessionStorage+redirect-state localStorage on logout before calling signOut.
