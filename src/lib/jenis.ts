import type { Jenis } from "./types";

/** Semua jenis baris buku besar — untuk filter dan daftar. */
export const JENIS_SEMUA: Jenis[] = [
  "belanja",
  "topup",
  "refund",
  "biaya_dompet",
  "koreksi",
  "transfer_keluar",
  "transfer_masuk",
];

/**
 * Jenis yang boleh ditulis lewat formulir satuan.
 *
 * `transfer_keluar` / `transfer_masuk` tidak ada di sini: keduanya selalu lahir
 * berpasangan lewat aksi pindah saldo. Satu sisi transfer yang bisa dibuat
 * sendirian berarti uang keluar dari sebuah dompet tanpa masuk ke mana pun —
 * dan karena transfer tidak menyentuh total biaya, tidak ada angka lain yang
 * akan memperlihatkan kebocoran itu.
 */
export const JENIS_MANUAL: Jenis[] = [
  "belanja",
  "topup",
  "refund",
  "biaya_dompet",
  "koreksi",
];

export function isJenis(v: string, daftar: Jenis[] = JENIS_SEMUA): v is Jenis {
  return (daftar as string[]).includes(v);
}
