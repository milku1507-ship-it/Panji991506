---
name: HPP-Stock sync integrity
description: Why deleting a stock ingredient must also remove it from HPP bahan[] arrays, and how the sync works.
---

## Rule
Deleting a stock ingredient (`stok/`) MUST also remove the matching `bahan` entry from every HPP product variant (`hpp/`), atomically in the same Firestore batch.

**Why:** `syncHppToStock` (App.tsx) runs automatically 2 seconds after `products` changes. It scans all `bahan[]` entries and re-creates any material that exists in HPP but is missing from stock. If you only delete from `stok/` and leave the HPP `bahan[]` untouched, the sync immediately re-adds the deleted ingredient — making deletion appear to "not work".

**How to apply:**
- The correct delete path is `deleteIngredientWithHppCleanup` (App.tsx), passed to StockManager as `onDeleteIngredient`.
- The batch: `batch.delete(stok/id)` + `batch.set(hpp/productId, updatedProduct)` for every HPP doc whose variant contained that bahan name.
- Local state is updated after `batch.commit()` succeeds: filter `ingredients`, replace `products`.
- `deleteFromStock` (the older name-based helper called from HPPManager) does NOT do HPP cleanup — it's intentional, because HPPManager already removes the bahan before calling it.
