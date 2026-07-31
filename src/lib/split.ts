/**
 * Pembagian satu pembayaran ke beberapa brand.
 *
 * Dipakai bersama server (saat mencatat) dan klien (pratinjau + tombol bagi
 * rata). Satu sumber, supaya angka yang diperlihatkan formulir tidak pernah
 * berbeda dari angka yang benar-benar tersimpan.
 *
 * Aturan yang dijaga di sini cuma satu, tapi mutlak: **jumlah porsinya harus
 * sama persis dengan yang dibagi.** Selisih sepersejuta USDT pun tidak boleh
 * lolos — kalau tidak, saldo dompet perlahan menyimpang dari kenyataan dan
 * penyebabnya nyaris tidak mungkin dilacak belakangan.
 */

/** USDT disimpan sampai 6 desimal; hitungan dilakukan dalam satuan terkecil itu. */
const MICRO = 1_000_000;

export function toMicro(n: number): number {
  return Math.round(n * MICRO);
}

export function fromMicro(u: number): number {
  return u / MICRO;
}

/** Dua nominal USDT sama persis sampai satuan terkecilnya? */
export function sameUsdt(a: number, b: number): boolean {
  return toMicro(a) === toMicro(b);
}

/**
 * Membagi `total` mengikuti perbandingan `weights`.
 *
 * Memakai metode sisa-terbesar: tiap porsi mengambil bagian bulatnya dulu, lalu
 * satuan yang tersisa dibagikan ke porsi dengan pecahan terbesar. Hasilnya
 * selalu berjumlah persis `total`, dan tidak ada porsi yang jadi negatif.
 *
 * Hitungannya pakai BigInt, bukan float. `total × weight` mudah melewati batas
 * bilangan bulat aman JavaScript (2^53) begitu nominalnya puluhan ribu USDT —
 * dan kalau itu terjadi, hasil pembagiannya salah tanpa memberi tanda apa pun.
 */
// Ditulis lewat konstruktor, bukan literal `0n`/`1n`: tsconfig proyek ini
// menargetkan ES2017, dan literal BigInt baru sah dari ES2020.
const ZERO = BigInt(0);
const ONE = BigInt(1);

export function proportional(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const T = BigInt(toMicro(total));
  const w = weights.map((x) => BigInt(toMicro(x)));
  const W = w.reduce((a, b) => a + b, ZERO);
  if (T === ZERO || W === ZERO) return weights.map(() => 0);

  const base = w.map((x) => (T * x) / W);
  const rem = w.map((x) => (T * x) % W);

  const out = base.slice();
  let rest = T - base.reduce((a, b) => a + b, ZERO);
  const byRemainder = rem
    .map((r, i) => ({ i, r }))
    .sort((a, b) => (a.r < b.r ? 1 : a.r > b.r ? -1 : a.i - b.i));

  for (let k = 0; rest > ZERO && k < byRemainder.length; k++, rest -= ONE) {
    out[byRemainder[k].i] += ONE;
  }

  return out.map((u) => fromMicro(Number(u)));
}

/** `total` dibagi rata ke `n` porsi. Sisa yang tidak habis dibagi jatuh ke porsi awal. */
export function evenShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  return proportional(total, Array(n).fill(1));
}

/** Porsi sebagai persen dari totalnya — untuk ditampilkan, bukan untuk berhitung. */
export function sharePct(share: number, total: number): number {
  if (!(total > 0)) return 0;
  return (share / total) * 100;
}

/** Nominal yang mewakili `pct` persen dari `total`, dibulatkan ke satuan terkecil. */
export function pctToShare(pct: number, total: number): number {
  return fromMicro(Math.round((toMicro(total) * pct) / 100));
}
