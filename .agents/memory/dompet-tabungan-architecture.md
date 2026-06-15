---
name: Dompet Tabungan Architecture
description: Design decisions for the savings wallet feature — Firestore paths, P&L exclusion, atomic batch pattern, and delete reversal.
---

## Core Rule
Transactions touching a dompet (wallet) MUST be excluded from P&L calculations. This is enforced via `kategori_arus_kas` field on Transaction.

## Firestore Paths
- Wallets: `users/{uid}/dompet/{dompetId}` — `Dompet` type with `saldo_terkumpul`
- Transactions: `users/{uid}/transaksi/{txId}` — extended with `sumber_dana` + `kategori_arus_kas`

## kategori_arus_kas Values
- `mutasi_ke_dompet`: money moves from saldo utama INTO a wallet. P&L excluded. `sumber_dana = dompetId`, delta = +nominal on dompet.
- `pengeluaran_dompet`: spending FROM a wallet. P&L excluded. `sumber_dana = dompetId`, delta = -nominal on dompet.
- `pengeluaran_operasional`: normal expense. Included in P&L (default for all older data without this field).

## P&L Exclusion
`computeStats` in `transactionStats.ts` filters via `isOperational()` helper which returns false for `mutasi_ke_dompet` and `pengeluaran_dompet`. Old data without the field is treated as operational (backward compat).

## Atomic Batch Pattern
All dompet balance updates happen in the same `writeBatch` as the transaction write. Pass `dompetOp?: { id, delta }` to `processAndSaveTransaction`. The batch includes both `batch.set(txRef, ...)` and `batch.update(dompetRef, { saldo_terkumpul: increment(delta) })`.

## Delete Reversal
Both `deleteTransaction` (no stock snapshot) and `confirmDelete` (with stock snapshot) reverse the dompet balance atomically in the same batch as the delete.

**Why:** Without atomic operations, a failed batch could leave dompet balance out of sync with transaction history. Without reversal on delete, deleting a mutasi would leave the dompet balance inflated.

**How to apply:** Any new code path that creates or deletes transactions must check `kategori_arus_kas` and include the corresponding dompet batch update.
