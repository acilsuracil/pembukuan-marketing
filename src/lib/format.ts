import type { Jenis, PengajuanStatus, Sumber } from "./types";

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

const idrFmt = nf(0, 0);

/** "Rp 1.250.000". Rupiah tidak dipakai sampai sen, jadi tanpa desimal. */
export function fmtIdr(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const n = Math.round(v);
  return n < 0 ? `−Rp ${idrFmt.format(-n)}` : `Rp ${idrFmt.format(n)}`;
}

/** Kolom `links` pengajuan (satu per baris) jadi daftar. */
export function pisahLink(links: string | null | undefined): string[] {
  return (links ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Baris "Link" di format untuk finance — kosong kalau tidak ada link. */
export function linkFinance(links: string[]): string[] {
  return links.length === 0 ? [] : ["Link :", ...links];
}

/**
 * Baris "Brand" di format untuk finance. Satu brand tetap satu baris; kalau
 * dibagi, tiap brand turun ke barisnya sendiri dengan porsinya:
 *
 *   Brand :
 *   P138 ( Rp 1.000.000 )
 *   S138 ( Rp 1.000.000 )
 */
export function brandFinance(
  tunggal: string,
  porsi: Array<{ nama: string; nominal: number | null }>,
): string {
  if (porsi.length === 0) return `Brand : ${tunggal.toUpperCase() || "—"}`;
  return [
    "Brand :",
    ...porsi.map((p) => `${p.nama.toUpperCase()} ( ${p.nominal === null ? "—" : fmtIdr(p.nominal)} )`),
  ].join("\n");
}

/** Angka saja, tanpa "Rp" — untuk kolom tabel yang sudah berjudul rupiah. */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return idrFmt.format(Math.round(v));
}

/** Bertanda eksplisit, untuk kolom mutasi: "+2.000.000" / "−350.000". */
export function fmtSigned(v: number): string {
  const n = Math.round(v);
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${idrFmt.format(Math.abs(n))}`;
}

/** Ringkas untuk sumbu chart: 12,5 rb / 1,2 jt / 3,4 M */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(0, 1).format(v / 1e9)} M`;
  if (a >= 1e6) return `${nf(0, 1).format(v / 1e6)} jt`;
  if (a >= 1e3) return `${nf(0, 1).format(v / 1e3)} rb`;
  return nf(0, 0).format(v);
}

export function pct(part: number, whole: number, digits = 1): string {
  if (!whole) return "–";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

/* ---------------------------------------------------------------- tanggal */

/**
 * Semua tanggal pembukuan ini memakai jam Jakarta, bukan jam server.
 *
 * Servernya jalan di UTC, dan belanja yang dicatat jam 8 malam WIB akan mendapat
 * tanggal hari sebelumnya kalau memakai waktu lokal server — cukup untuk membuat
 * "belanja hari ini" dan rekonsiliasi mutasi bank tidak pernah cocok.
 */
const TZ = "Asia/Jakarta";

const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-07" -> "Jul 26" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${BULAN[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** "2026-07" -> "Juli 2026" */
export function monthLabelLong(ym: string): string {
  const [y, m] = ym.split("-");
  return `${BULAN_PANJANG[Number(m) - 1] ?? m} ${y}`;
}

/** "2026-07-27" -> "27 Jul 2026" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "–";
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${BULAN[Number(m) - 1] ?? m} ${y}`;
}

/** Cap waktu ISO -> "27 Jul 2026 14:05" dalam waktu Jakarta. */
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "–";
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

/** Tanggal `n` hari sebelum/sesudah tanggal ISO tertentu. */
export function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

/** Selisih hari antara dua tanggal ISO (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

export function firstDayOfMonth(ym: string): string {
  return `${ym}-01`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Daftar bulan berurutan dari `from` sampai `to`, inklusif. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/* ----------------------------------------------------------------- label */

export const JENIS_LABEL: Record<Jenis, string> = {
  topup: "Top-up dompet",
  belanja: "Pengeluaran",
  refund: "Refund",
  biaya_dompet: "Biaya bank",
  koreksi: "Koreksi saldo",
  transfer_keluar: "Pindah saldo keluar",
  transfer_masuk: "Pindah saldo masuk",
};

export const SUMBER_LABEL: Record<Sumber, string> = {
  finance: "Finance langsung",
  dompet: "Dari dompet",
};

export const STATUS_LABEL: Record<PengajuanStatus, string> = {
  draft: "Draft",
  diajukan: "Diajukan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  dibayar: "Dibayar",
};
