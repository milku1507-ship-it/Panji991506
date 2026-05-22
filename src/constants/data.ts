
import { Ingredient, Product, Transaction, HppMaterial } from '../types';

const MATERIAL_UTAMA: HppMaterial[] = [
  { nama: 'Bahan Utama A', satuan: 'gram', qty: 500, harga: 20, kelompok: 'Material Utama' },
  { nama: 'Bahan Utama B', satuan: 'gram', qty: 200, harga: 15, kelompok: 'Material Utama' },
];

const MATERIAL_PENDUKUNG: HppMaterial[] = [
  { nama: 'Komponen Pendukung', satuan: 'pcs', qty: 2, harga: 500, kelompok: 'Material Pendukung' },
];

const KEMASAN_MATERIALS: HppMaterial[] = [
  { nama: 'Kemasan / Packaging', satuan: 'pcs', qty: 1, harga: 2000, kelompok: 'Kemasan' },
  { nama: 'Stiker Label', satuan: 'pcs', qty: 1, harga: 500, kelompok: 'Kemasan' },
];

const OVERHEAD_MATERIALS: HppMaterial[] = [
  { nama: 'Listrik', satuan: 'unit', qty: 1, harga: 500, kelompok: 'Overhead' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod_1",
    nama: "Produk Contoh",
    deskripsi: "Contoh produk dengan beberapa varian",
    varian: [
      {
        id: "var_1",
        nama: "Varian Standar",
        harga_jual: 25000,
        qty_batch: 10,
        harga_packing: 2000,
        bahan: [
          ...MATERIAL_UTAMA,
          ...MATERIAL_PENDUKUNG,
          ...KEMASAN_MATERIALS,
          ...OVERHEAD_MATERIALS,
        ]
      },
      {
        id: "var_2",
        nama: "Varian Premium",
        harga_jual: 35000,
        qty_batch: 10,
        harga_packing: 3000,
        bahan: [
          ...MATERIAL_UTAMA,
          ...MATERIAL_PENDUKUNG,
          ...KEMASAN_MATERIALS,
          ...OVERHEAD_MATERIALS,
        ]
      },
    ]
  },
  {
    id: "prod_2",
    nama: "Produk Paket",
    deskripsi: "Paket bundling beberapa unit",
    varian: [
      {
        id: "var_3",
        nama: "Paket Isi 5",
        harga_jual: 100000,
        qty_batch: 5,
        harga_packing: 5000,
        bahan: []
      }
    ]
  }
];

export const CATEGORIES_LIST = [
  { name: 'Penjualan', type: 'Pemasukan', fixed: true },
  { name: 'Material Utama', type: 'Pengeluaran', fixed: true },
  { name: 'Kemasan', type: 'Pengeluaran', fixed: true },
  { name: 'Gaji', type: 'Pengeluaran', fixed: true },
  { name: 'Operasional', type: 'Pengeluaran', fixed: true },
  { name: 'Tabungan', type: 'Pengeluaran', fixed: true },
  { name: 'Biaya Iklan', type: 'Pengeluaran', fixed: true },
  { name: 'Saldo sisa', type: 'Pemasukan', fixed: true },
  { name: 'Lainnya', type: 'Pengeluaran', fixed: false },
];

export const INITIAL_INGREDIENTS: Ingredient[] = [
  // MATERIAL UTAMA
  { id: '1', name: 'Bahan Utama A', category: 'Material Utama', unit: 'gram', price: 20, initialStock: 5000, currentStock: 5000, minStock: 1000 },
  { id: '2', name: 'Bahan Utama B', category: 'Material Utama', unit: 'gram', price: 15, initialStock: 2000, currentStock: 2000, minStock: 500 },

  // MATERIAL PENDUKUNG
  { id: '11', name: 'Komponen Pendukung', category: 'Material Pendukung', unit: 'pcs', price: 500, initialStock: 200, currentStock: 200, minStock: 50 },

  // KEMASAN
  { id: '20', name: 'Kemasan / Packaging', category: 'Kemasan', unit: 'pcs', price: 2000, initialStock: 500, currentStock: 500, minStock: 100 },
  { id: '26', name: 'Stiker Label', category: 'Kemasan', unit: 'pcs', price: 500, initialStock: 500, currentStock: 500, minStock: 100 },

  // OVERHEAD
  { id: '28', name: 'Listrik', category: 'Overhead', unit: 'unit', price: 500, initialStock: 100, currentStock: 100, minStock: 10 },
];

export const SAMPLE_TRANSACTIONS: Transaction[] = [
  { 
    id: 't1', 
    tanggal: '2026-03-19', 
    keterangan: 'Penjualan Produk', 
    kategori: 'Penjualan', 
    jenis: 'Pemasukan', 
    nominal: 409688, 
    qty_total: 20,
    qty_beli: 0,
    penjualan_detail: [
      {
        produk_id: "prod_1",
        produk_nama: "Produk Contoh",
        varian: [
          { varian_id: "var_1", varian_nama: "Varian Standar", qty: 12 },
          { varian_id: "var_2", varian_nama: "Varian Premium", qty: 8 },
        ]
      }
    ]
  },
  { id: 't2', tanggal: '2026-03-23', keterangan: 'Pembelian Material Utama A', kategori: 'Material Utama', jenis: 'Pengeluaran', nominal: 100000, qty_total: 0, qty_beli: 5 },
  { id: 't3', tanggal: '2026-03-23', keterangan: 'Penjualan Produk', kategori: 'Penjualan', jenis: 'Pemasukan', nominal: 573244, qty_total: 18, qty_beli: 0 },
  { id: 't4', tanggal: '2026-03-02', keterangan: 'Biaya Operasional', kategori: 'Operasional', jenis: 'Pengeluaran', nominal: 31000, qty_total: 0, qty_beli: 0 },
  { id: 't5', tanggal: '2026-03-03', keterangan: 'Saldo Masuk', kategori: 'Saldo sisa', jenis: 'Pemasukan', nominal: 215557, qty_total: 0, qty_beli: 0 },
  { id: 't6', tanggal: '2026-03-08', keterangan: 'Penjualan Semua Varian', kategori: 'Penjualan', jenis: 'Pemasukan', nominal: 150000, qty_total: 6, qty_beli: 0 },
];
