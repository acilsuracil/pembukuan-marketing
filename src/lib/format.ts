const nf = (min: number, max: number) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

const usdtFmt = nf(2, 2);
const idrFmt = nf(0, 0);
const rateFmt = nf(0, 0);

export function fmtUsdt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `${usdtFmt.format(v)} USDT`;
}

export function fmtIdr(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `Rp ${idrFmt.format(Math.round(v))}`;
}

export function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `Rp ${rateFmt.format(Math.round(v))}`;
}

/** Ringkas untuk sumbu chart: 12,5 rb / 1,2 jt / 3,4 M */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(0, 1).format(v / 1e9)} M`;
  if (a >= 1e6) return `${nf(0, 1).format(v / 1e6)} jt`;
  if (a >= 1e3) return `${nf(0, 1).format(v / 1e3)} rb`;
  return nf(0, 0).format(v);
}

const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-07" -> "Jul 26" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${BULAN[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

/** "2026-07" -> "Juli 2026" */
export function monthLabelLong(ym: string): string {
  const LONG = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [y, m] = ym.split("-");
  return `${LONG[Number(m) - 1] ?? m} ${y}`;
}

/** "2026-07-27" -> "27 Jul 2026" */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${BULAN[Number(m) - 1] ?? m} ${y}`;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
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
