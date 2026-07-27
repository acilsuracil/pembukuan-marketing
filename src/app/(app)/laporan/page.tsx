import { connection } from "next/server";
import PeriodPicker from "@/components/PeriodPicker";
import StatTile from "@/components/StatTile";
import CashflowChart from "@/components/charts/CashflowChart";
import CategoryBars from "@/components/charts/CategoryBars";
import {
  addMonths,
  currentMonth,
  fmtIdr,
  fmtRate,
  fmtUsdt,
  monthLabelLong,
} from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import {
  brandCategoryCross,
  brandSpend,
  categorySpend,
  firstMonth,
  getSummary,
  monthlyFlowsBetween,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

type SP = Record<string, string | string[] | undefined>;

function pick(sp: SP, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Hari terakhir bulan `ym` dalam format ISO. */
function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  await requireUser();
  const sp = await searchParams;

  const now = currentMonth();
  const earliest = firstMonth() ?? now;
  const from = /^\d{4}-\d{2}$/.test(pick(sp, "from")) ? pick(sp, "from") : addMonths(now, -5);
  const to = /^\d{4}-\d{2}$/.test(pick(sp, "to")) ? pick(sp, "to") : now;
  const [lo, hi] = from <= to ? [from, to] : [to, from];

  const range = { from: `${lo}-01`, to: endOfMonth(hi) };
  const s = getSummary(range);
  const flows = monthlyFlowsBetween(lo, hi);
  const byBrand = brandSpend(range);
  const byCategory = categorySpend(range);
  const cross = brandCategoryCross(range);

  const label =
    lo === hi ? monthLabelLong(lo) : `${monthLabelLong(lo)} – ${monthLabelLong(hi)}`;
  const qs = new URLSearchParams({ from: range.from, to: range.to }).toString();

  // Matriks brand × kategori: baris = brand terbesar, kolom = kategori terbesar.
  const catCols = byCategory.slice(0, 6);
  const catIds = new Set(catCols.map((c) => c.id));
  const cellOf = new Map<string, number>();
  for (const c of cross) {
    const col = catIds.has(c.category_id) ? String(c.category_id) : "lain";
    const key = `${c.brand_id}|${col}`;
    cellOf.set(key, (cellOf.get(key) ?? 0) + c.usdt);
  }
  const hasOther = byCategory.length > catCols.length;

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Laporan</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{label}</p>
        </div>
        <a href={`/api/export?${qs}`} className="btn btn-ghost" download>
          Ekspor CSV periode ini
        </a>
      </div>

      <PeriodPicker from={lo} to={hi} min={earliest} max={now} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Uang masuk" value={fmtUsdt(s.inUsdt)} sub={fmtIdr(s.inIdr)} />
        <StatTile label="Uang keluar" value={fmtUsdt(s.outUsdt)} sub={fmtIdr(s.outIdr)} />
        <StatTile
          label="Arus bersih"
          value={`${s.inUsdt - s.outUsdt >= 0 ? "+" : "−"}${fmtUsdt(
            Math.abs(s.inUsdt - s.outUsdt),
          )}`}
          sub={fmtIdr(s.inIdr - s.outIdr)}
        />
        <StatTile
          label="Saldo dompet saat ini"
          value={fmtUsdt(s.balanceUsdt)}
          sub={`Kurs acuan ${fmtRate(s.lastRate)}`}
        />
      </div>

      <CashflowChart data={flows} periodLabel={label} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBars data={byBrand} title="Pemakaian per brand" subtitle={label} />
        <CategoryBars data={byCategory} title="Pengeluaran per kategori" subtitle={label} />
      </div>

      {byBrand.length > 0 && catCols.length > 0 && (
        <section className="card">
          <div className="border-b border-[var(--hairline)] px-4 py-3">
            <h2 className="text-sm font-semibold">Brand × kategori</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Berapa besar tiap brand memakai USDT, dirinci per jenis pengeluaran
              (USDT).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr className="border-b border-[var(--hairline)]">
                  <th className="px-4 py-2.5 font-medium">Brand</th>
                  {catCols.map((c) => (
                    <th key={c.id ?? c.name} className="px-4 py-2.5 text-right font-medium">
                      {c.name}
                    </th>
                  ))}
                  {hasOther && (
                    <th className="px-4 py-2.5 text-right font-medium">Lainnya</th>
                  )}
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {byBrand.map((b) => (
                  <tr key={b.id ?? b.name} className="border-b border-[var(--hairline)] last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-[2px]"
                          style={{ background: seriesVar(b.color_slot) }}
                        />
                        {b.name}
                      </span>
                    </td>
                    {catCols.map((c) => {
                      const v = cellOf.get(`${b.id}|${c.id}`) ?? 0;
                      return (
                        <td
                          key={c.id ?? c.name}
                          className={`px-4 py-2.5 text-right ${
                            v === 0 ? "text-[var(--text-muted)]" : ""
                          }`}
                        >
                          {v === 0 ? "—" : fmtUsdt(v).replace(" USDT", "")}
                        </td>
                      );
                    })}
                    {hasOther && (
                      <td className="px-4 py-2.5 text-right">
                        {(cellOf.get(`${b.id}|lain`) ?? 0) === 0
                          ? "—"
                          : fmtUsdt(cellOf.get(`${b.id}|lain`) ?? 0).replace(" USDT", "")}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right font-medium">
                      {fmtUsdt(b.usdt).replace(" USDT", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Rekap bulanan</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Rupiah dinilai pada kurs yang berlaku untuk tiap transaksi — uang masuk
            pada kurs belinya, uang keluar pada kurs pemasukan terakhir sebelumnya.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-[var(--text-muted)]">
              <tr className="border-b border-[var(--hairline)]">
                <th className="px-4 py-2.5 font-medium">Bulan</th>
                <th className="px-4 py-2.5 text-right font-medium">Masuk (USDT)</th>
                <th className="px-4 py-2.5 text-right font-medium">Keluar (USDT)</th>
                <th className="px-4 py-2.5 text-right font-medium">Bersih (USDT)</th>
                <th className="px-4 py-2.5 text-right font-medium">Modal masuk</th>
                <th className="px-4 py-2.5 text-right font-medium">Nilai keluar</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {flows.map((f) => (
                <tr key={f.month} className="border-b border-[var(--hairline)] last:border-0">
                  <td className="px-4 py-2.5">{monthLabelLong(f.month)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {fmtUsdt(f.in_usdt).replace(" USDT", "")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {fmtUsdt(f.out_usdt).replace(" USDT", "")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {fmtUsdt(f.in_usdt - f.out_usdt).replace(" USDT", "")}
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmtIdr(f.in_idr)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtIdr(f.out_idr)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--axis)] font-medium">
                <td className="px-4 py-2.5">Total</td>
                <td className="tnum px-4 py-2.5 text-right">
                  {fmtUsdt(s.inUsdt).replace(" USDT", "")}
                </td>
                <td className="tnum px-4 py-2.5 text-right">
                  {fmtUsdt(s.outUsdt).replace(" USDT", "")}
                </td>
                <td className="tnum px-4 py-2.5 text-right">
                  {fmtUsdt(s.inUsdt - s.outUsdt).replace(" USDT", "")}
                </td>
                <td className="tnum px-4 py-2.5 text-right">{fmtIdr(s.inIdr)}</td>
                <td className="tnum px-4 py-2.5 text-right">{fmtIdr(s.outIdr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
