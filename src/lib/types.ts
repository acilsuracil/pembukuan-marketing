export type Role = "owner" | "admin" | "staff";

/** Jenis baris buku besar. Efek tiap jenis ke saldo & biaya ada di `v_transaksi`. */
export type Jenis =
  | "topup"
  | "belanja"
  | "refund"
  | "biaya_dompet"
  | "koreksi"
  | "transfer_keluar"
  | "transfer_masuk";

/** Asal uang sebuah belanja: langsung dari finance, atau dari dompet kita. */
export type Sumber = "finance" | "dompet";

/** Tujuan dana yang diminta ke finance. */
export type Tujuan = "langsung" | "dompet";

export type PengajuanStatus =
  | "draft"
  | "diajukan"
  | "disetujui"
  | "ditolak"
  | "dibayar";

/* ------------------------------------------------------------ data master */

export interface Divisi {
  id: number;
  name: string;
  color_slot: number;
  budget_idr: number;
  note: string;
  archived: number;
  created_at: string;
}

/** Sebutan kerja untuk sebuah pengeluaran: Perpanjang, Gajian, Pelunasan, … */
export interface JenisBayar {
  id: number;
  name: string;
  color_slot: number;
  budget_idr: number;
  note: string;
  archived: number;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  pic: string;
  color_slot: number;
  budget_idr: number;
  note: string;
  archived: number;
  created_at: string;
}

export interface Platform {
  id: number;
  name: string;
  /** Divisi usulan yang mengisi formulir; bukan pengikat laporan. */
  divisi_id: number | null;
  dompet_id: number | null;
  color_slot: number;
  note: string;
  archived: number;
  created_at: string;
  divisi_name: string | null;
  dompet_name: string | null;
}

export interface AkunIklan {
  id: number;
  platform_id: number;
  name: string;
  brand_id: number | null;
  dompet_id: number | null;
  note: string;
  archived: number;
  created_at: string;
  platform_name: string | null;
  brand_name: string | null;
  dompet_name: string | null;
}

export interface Dompet {
  id: number;
  name: string;
  jenis: "bank" | "ewallet" | "lain";
  bank: string;
  no_rek: string;
  pemilik: string;
  saldo_awal: number;
  tanggal_awal: string;
  min_saldo: number;
  note: string;
  archived: number;
  created_at: string;
}

/** Dompet beserta saldo berjalannya, dari view `v_saldo_dompet`. */
export interface SaldoDompet extends Dompet {
  masuk: number;
  keluar: number;
  sisa: number;
  belanja: number;
  topup: number;
  tx_count: number;
  last_tanggal: string | null;
}

export interface Penerima {
  id: number;
  nama: string;
  bank: string;
  no_rek: string;
  note: string;
  archived: number;
  created_at: string;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  active: number;
  /** Override izin per user dalam bentuk JSON; null = ikut default peran. */
  perms: string | null;
  session_epoch: number;
  pass_changed_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

/* -------------------------------------------------------------- pengajuan */

export interface PengajuanRow {
  id: number;
  tanggal: string;
  keterangan: string;
  nominal: number;
  tujuan: Tujuan;
  penerima_id: number | null;
  dompet_id: number | null;
  brand_id: number | null;
  platform_id: number | null;
  divisi_id: number | null;
  status: PengajuanStatus;
  tanggal_bayar: string | null;
  nominal_cair: number | null;
  catatan: string;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  penerima_nama: string | null;
  penerima_bank: string | null;
  penerima_no_rek: string | null;
  dompet_name: string | null;
  dompet_bank: string | null;
  dompet_no_rek: string | null;
  dompet_pemilik: string | null;
  brand_name: string | null;
  platform_name: string | null;
  divisi_name: string | null;
  created_by_name: string | null;
  /** Jumlah baris buku besar yang lahir dari pengajuan ini. */
  tx_count: number;
  /** Jumlah brand pada pembagian. 0 = brand tunggal lewat `brand_id`. */
  brand_count: number;
  /** Nama brand pembagian, dipisah koma — untuk ringkasan di daftar. */
  brand_ringkas: string | null;
}

/** Porsi satu brand dalam pengajuan yang dibagi ke beberapa brand. */
export interface PengajuanBrand {
  id: number;
  pengajuan_id: number;
  brand_id: number;
  nominal: number;
  brand_name: string;
  color_slot: number;
}

/* ------------------------------------------------------------ buku besar */

export interface TxRow {
  id: number;
  tanggal: string;
  jenis: Jenis;
  nominal: number;
  arah: number;
  sumber: Sumber | null;
  dompet_id: number | null;
  divisi_id: number | null;
  platform_id: number | null;
  brand_id: number | null;
  akun_iklan_id: number | null;
  penerima_id: number | null;
  jenis_bayar_id: number | null;
  pengajuan_id: number | null;
  keterangan: string;
  no_ref: string;
  split_group: string | null;
  /** Sisi lain sebuah pindah saldo antar-dompet; null kalau bukan transfer. */
  pasangan_id: number | null;
  pasangan_dompet_name: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string | null;
  divisi_name: string | null;
  divisi_slot: number | null;
  jenis_bayar_name: string | null;
  platform_name: string | null;
  platform_slot: number | null;
  brand_name: string | null;
  brand_slot: number | null;
  dompet_name: string | null;
  akun_iklan_name: string | null;
  penerima_nama: string | null;
  penerima_bank: string | null;
  penerima_no_rek: string | null;
  created_by_name: string | null;
  bulan: string;
  /** Pengaruh baris ini ke saldo dompet, bertanda. */
  delta_saldo: number;
  /** Pengaruh baris ini ke Total Biaya Marketing, bertanda. */
  delta_biaya: number;
  bukti_count: number;
}

/** Satu baris mutasi dompet beserta saldo berjalannya. */
export interface MutasiRow extends TxRow {
  saldo_setelah: number;
}

export interface Opname {
  id: number;
  dompet_id: number;
  tanggal: string;
  saldo_aktual: number;
  catatan: string;
  created_by: number | null;
  created_at: string;
  created_by_name: string | null;
}

/* --------------------------------------------------------------- laporan */

/** Satu kelompok pada laporan: divisi, platform, atau brand. */
export interface GroupSpend {
  id: number | null;
  name: string;
  color_slot: number;
  biaya: number;
  budget_idr: number;
  tx_count: number;
}

export interface MonthTotal {
  bulan: string;
  biaya: number;
  topup: number;
}

export interface DayTotal {
  tanggal: string;
  biaya: number;
}

export interface CrossCell {
  divisi_id: number | null;
  divisi_name: string;
  platform_id: number | null;
  platform_name: string;
  biaya: number;
}

export interface Attachment {
  id: string;
  tx_id: number;
  stored_name: string;
  orig_name: string;
  mime: string;
  size: number;
  uploaded_by: number | null;
  created_at: string;
  storage: "local" | "supabase";
}

export interface ActivityRow {
  id: number;
  ts: string;
  user_id: number | null;
  username: string;
  role: string;
  action: string;
  detail: string;
}
