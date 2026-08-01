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

/** Jendela minimum yang selalu ditawarkan, walaupun belum ada datanya sama sekali. */
const MIN_MONTHS = 12;
const MIN_YEARS = 2;
/** Batas atas daftar bulan; yang lebih tua tetap terjangkau lewat tampilan tahunan. */
const MAX_MONTHS = 36;

/**
 * Pilihan yang ditawarkan pemilih periode, terbaru lebih dulu.
 *
 * Daftarnya **tidak** dipotong sebatas rentang data. Pembukuan yang baru
 * berjalan dua bulan akan menghasilkan dropdown berisi dua pilihan — dan itu
 * terbaca seperti pemilihnya rusak, bukan seperti datanya yang memang belum ada.
 * Jadi selalu ada jendela minimum, dan periode yang belum ada isinya ditandai
 * lewat `filled` supaya tidak perlu dibuka satu-satu untuk tahu itu kosong.
 */
export function periodOptions(earliest: string | null): {
  months: string[];
  years: string[];
} {
  const now = currentMonth();
  const floor = addMonths(now, -(MAX_MONTHS - 1));
  const want = addMonths(now, -(MIN_MONTHS - 1));
  // Mundur sampai data tertua, tapi tidak pernah kurang dari jendela minimum
  // dan tidak pernah melewati batas atas.
  let start = earliest && earliest < want ? earliest : want;
  if (start < floor) start = floor;
  const months = monthRange(start > now ? now : start, now).reverse();

  const thisYear = Number(now.slice(0, 4));
  const dataYear = Number((earliest ?? now).slice(0, 4));
  const firstYear = Math.min(dataYear, thisYear - (MIN_YEARS - 1));
  const years: string[] = [];
  for (let y = thisYear; y >= firstYear; y--) years.push(String(y));

  return { months, years };
}

/** Apakah periode ini punya transaksi? `filled` adalah daftar bulan yang ada isinya. */
export function periodHasData(key: string, filled: Set<string>): boolean {
  if (key.length === 4) {
    for (const m of filled) if (m.startsWith(`${key}-`)) return true;
    return false;
  }
  return filled.has(key);
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
