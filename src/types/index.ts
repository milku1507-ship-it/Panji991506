export interface AdditionalFee {
  nama?: string;
  name?: string;
  tipe?: string;
  type?: string;
  nilai?: number;
  amount?: number;
}

export interface HppMaterial {
  id?: string;
  nama: string;
  satuan: string;
  qty: number;
  harga: number;
  kelompok?: string;
  ingredientId?: string;
}

export interface Variant {
  id: string;
  nama: string;
  harga_jual: number;
  qty_batch: number;
  harga_packing: number;
  bahan: HppMaterial[];
  photoUrl?: string;
  sku?: string;
  harga_coret?: number;
  diskon_persen?: number;
  min_order?: number;
  biaya_lain?: AdditionalFee[];
}

export interface Product {
  id: string;
  nama: string;
  deskripsi?: string;
  varian: Variant[];
  photoUrl?: string;
  foto?: string;
  category?: string;
  kategori?: string;
  sku?: string;
  min_order?: number;
  biaya_lain?: AdditionalFee[];
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  initialStock: number;
  currentStock: number;
  minStock: number;
  fromHpp?: boolean;
}

export interface PenjualanDetailVarian {
  varian_id: string;
  varian_nama: string;
  qty: number;
  harga?: number;
  hpp?: number;
  sku?: string;
}

export interface PenjualanDetail {
  produk_id: string;
  produk_nama: string;
  varian: PenjualanDetailVarian[];
}

export type KategoriArusKas = 'pengeluaran_operasional' | 'mutasi_ke_dompet' | 'pengeluaran_dompet';

export interface Transaction {
  id: string;
  tanggal: string;
  tanggal_akhir?: string | null;
  keterangan: string;
  kategori: string;
  jenis: 'Pemasukan' | 'Pengeluaran' | string;
  nominal: number;
  qty_total?: number;
  qty_beli?: number;
  materialId?: string;
  total_biaya?: number;
  total_penjualan?: number;
  sumber_dana?: string;
  dompet_id?: string;
  kategori_arus_kas?: KategoriArusKas | string;
  penjualan_detail?: PenjualanDetail[];
  shopee_audit?: any;
  stockSnapshot?: any;
}

export interface StoreSettings {
  name: string;
  logoUrl?: string;
  logo?: string;
  address?: string;
  phone?: string;
  showLogoOnReceipt?: boolean;
  showNameOnReceipt?: boolean;
  showAddressOnReceipt?: boolean;
  showLogoInHeader?: boolean;
  showLogoInSidebar?: boolean;
  receiptFooter?: string;
  onboardingCompleted?: boolean;
}

export interface Dompet {
  id: string;
  nama: string;
  jenis?: 'rekening' | 'ewallet' | 'kas' | string;
  saldo_terkumpul: number;
  target_saldo?: number;
  catatan?: string;
  createdAt?: any;
}

export interface KategoriSettings {
  kategori_hpp?: string[];
  kategori_produk?: string[];
  satuan_unit?: string[];
  kategoriList?: { name: string; type: 'Pemasukan' | 'Pengeluaran'; fixed?: boolean }[];
}
