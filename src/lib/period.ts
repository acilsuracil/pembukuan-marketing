/**
 * Periode yang sedang ditampilkan dashboard: satu bulan, atau satu tahun penuh.
 *
 * Sengaja tidak menyediakan rentang tanggal bebas seperti halaman Transaksi dan
 * Laporan. Dashboard memuat budget bulanan, arus per bulan, dan saldo awal/akhir
 * — semuanya hanya punya arti kalau batasnya jatuh persis di pergantian bulan.
 * Rentang "12 Mar – 4 Mei" akan membuat angka-angka itu tidak bisa dijelaskan.
 *
 * Dipakai bersama server (menyaring query) dan klien (pemilih periodenya), jadi
 * isinya harus tetap murni — tanpa DOM dan tanpa akses database.
 */

import { addMonths, currentMonth, monthLabelLong, monthRange } from "./format";

export interface Period {
  /** Nilai untuk query `?periode=`: "YYYY-MM" atau "YYYY". */
  key: string;
  kind: "month" | "year";
  /** Batas tanggal untuk TxFilter, inklusif di kedua ujungnya. */
  from: string;
  to: string;
  /** Bulan pertama dan terakhir periode — dasar saldo awal dan rentang grafik. */
  firstMonth: string;
  lastMonth: string;
  label: string;
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_KEY = /^\d{4}$/;

export function monthPeriod(ym: string): Period {
  return {
    key: ym,
    kind: "month",
    from: `${ym}-01`,
    // Tanggalnya dibandingkan sebagai teks ISO, jadi "-31" aman untuk bulan
    // pendek sekalipun: tidak ada tanggal yang melewatinya secara leksikografis.
    to: `${ym}-31`,
    firstMonth: ym,
    lastMonth: ym,
    label: monthLabelLong(ym),
  };
}

export function yearPeriod(y: string): Period {
  return {
    key: y,
    kind: "year",
    from: `${y}-01-01`,
    to: `${y}-12-31`,
    firstMonth: `${y}-01`,
    lastMonth: `${y}-12`,
    label: `Tahun ${y}`,
  };
}

/** Bulan berjalan kalau nilainya kosong atau tidak dikenali. */
export function parsePeriod(raw: string | string[] | undefined): Period {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (MONTH_KEY.test(v)) return monthPeriod(v);
  if (YEAR_KEY.test(v)) return yearPeriod(v);
  return monthPeriod(currentMonth());
}

/**
 * Rentang bulan untuk grafik.
 *
 * Tampilan tahunan memperlihatkan 12 bulan tahun itu saja. Tampilan bulanan
 * memperlihatkan 12 bulan yang **berakhir** di bulan terpilih, bukan 12 bulan
 * terakhir dari hari ini — kalau tidak, membuka bulan lalu akan menampilkan
 * grafik yang batang terakhirnya bulan ini, dan periode yang dipilih tenggelam
 * di tengah.
 */
export function chartMonths(p: Period): { from: string; to: string } {
  return p.kind === "year"
    ? { from: p.firstMonth, to: p.lastMonth }
    : { from: addMonths(p.lastMonth, -11), to: p.lastMonth };
}

/** Pilihan yang ditawarkan pemilih periode, terbaru lebih dulu. */
export function periodOptions(earliest: string | null): {
  months: string[];
  years: string[];
} {
  const now = currentMonth();
  // Data yang lebih tua dari 3 tahun tetap bisa dibuka lewat tampilan tahunan,
  // jadi daftar bulannya tidak perlu memanjang tanpa batas.
  const floor = addMonths(now, -35);
  const start = earliest && earliest > floor ? earliest : floor;
  const months = monthRange(start > now ? now : start, now).reverse();

  const firstYear = Number((earliest ?? now).slice(0, 4));
  const thisYear = Number(now.slice(0, 4));
  const years: string[] = [];
  for (let y = thisYear; y >= Math.min(firstYear, thisYear); y--) years.push(String(y));

  return { months, years };
}

/**
 * URL dashboard dengan brand dan periode yang dipertahankan.
 *
 * Kedua pemilih harus membangun tautannya lewat sini. Mengganti salah satunya
 * dengan menulis ulang seluruh URL akan membuang pilihan satunya lagi tanpa
 * terlihat — mengganti brand lalu mendapati periodenya balik ke bulan ini.
 */
export function dashboardHref(v: { brand?: string; periode?: string }): string {
  const q = new URLSearchParams();
  if (v.brand) q.set("brand", v.brand);
  // Bulan berjalan adalah bawaannya, jadi tidak perlu mengotori URL.
  if (v.periode && v.periode !== currentMonth()) q.set("periode", v.periode);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
