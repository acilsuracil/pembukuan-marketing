import { connection } from "next/server";
import GroupBars from "@/components/charts/GroupBars";
import PeriodPicker from "@/components/PeriodPicker";
import StatTile from "@/components/StatTile";
import {
  currentMonth,
  firstDayOfMonth,
  fmtIdr,
  lastDayOfMonth,
  monthLabel,
  monthLabelLong,
  pct,
} from "@/lib/format";
import { hasPerm } from "@/lib/policy";
import {
  crossDivisiPlatform,
  getSummary,
  groupBiaya,
  monthlyTotals,
  reportRangeStart,
  type TxFilter,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { first, qs, type SP } from "@/lib/sp";

const MONTH = /^\d{4}-\d{2}$/;

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requireUser();
  const sp = await searchParams;

  const now = currentMonth();
  const fromRaw = first(sp, "from");
  const toRaw = first(sp, "to");
  const from = MONTH.test(fromRaw) ? fromRaw : now;
  const to = MONTH.test(toRaw) && toRaw >= from ? toRaw : now;

  const filter: TxFilter = {
    from: firstDayOfMonth(from),
    to: lastDayOfMonth(to),
  };

  const s = getSummary(filter);
  const perDivisi = groupBiaya("divisi", filter);
  const perPlatform = groupBiaya("platform", filter);
  const perBrand = groupBiaya("brand", filter);
  const bulanan = monthlyTotals(from, to);
  const cross = crossDivisiPlatform(filter);

  // Matriks divisi × platform: baris divisi, kolom platform, hanya yang terpakai.
  const divisiNames = [...new Set(cross.map((c) => c.divisi_name))].sort();
  const platformNames = [...new Set(cross.map((c) => c.platform_name))].sort();
  const cell = new Map(cross.map((c) => [`${c.divisi_name}|${c.platform_name}`, c.biaya]));
  const rowTotal = (d: string) =>
    cross.filter((c) => c.divisi_name === d).reduce((t, c) => t + c.biaya, 0);
  const colTotal = (p: string) =>
    cross.filter((c) => c.platform_name === p).reduce((t, c) => t + c.biaya, 0);

  const periodeLabel =
    from === to ? monthLabelLong(from) : `${monthLabel(from)} – ${monthLabel(to)}`;

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Laporan</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Periode {periodeLabel}. Total biaya = pengeluaran + biaya bank − refund;
            top-up ke dompet tidak dihitung sebagai biaya.
          </p>
        </div>
        {hasPerm(me, "exportData") && (
          <a
            href={`/api/export${qs({ from: filter.from, to: filter.to })}`}
            className="btn btn-ghost"
          >
            Ekspor CSV
          </a>
        )}
      </div>

      <PeriodPicker from={from} to={to} min={reportRangeStart()} max={now} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total biaya marketing"
          value={fmtIdr(s.biaya)}
          sub={`${s.txCount} baris`}
          hero
        />
        <StatTile
          label="Lewat dompet"
          value={fmtIdr(s.belanjaDompet)}
          sub={`${pct(s.belanjaDompet, s.belanjaDompet + s.belanjaFinance)} dari pengeluaran`}
        />
        <StatTile
          label="Finance langsung"
          value={fmtIdr(s.belanjaFinance)}
          sub={`${pct(s.belanjaFinance, s.belanjaDompet + s.belanjaFinance)} dari pengeluaran`}
        />
        <StatTile
          label="Refund & biaya bank"
          value={`${fmtIdr(s.refund)} / ${fmtIdr(s.biayaBank)}`}
          sub="refund mengurangi biaya, biaya bank menambah"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupBars
          data={perDivisi}
          title="Biaya per divisi"
          subtitle={periodeLabel}
          unit="divisi"
        />
        <GroupBars
          data={perPlatform}
          title="Biaya per platform"
          subtitle={periodeLabel}
          unit="platform"
        />
      </div>

      <GroupBars
        data={perBrand}
        title="Biaya per brand"
        subtitle={periodeLabel}
        unit="brand"
        max={10}
      />

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left text-sm font-semibold">
            Matriks divisi × platform
          </caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Divisi</th>
              {platformNames.map((p) => (
                <th key={p} className="px-3 py-2 text-right font-medium">
                  {p}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {divisiNames.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-xs text-[var(--text-muted)]"
                >
                  Belum ada biaya pada periode ini.
                </td>
              </tr>
            )}
            {divisiNames.map((d) => (
              <tr key={d} className="border-b border-[var(--hairline)]">
                <td className="px-4 py-2.5">{d}</td>
                {platformNames.map((p) => {
                  const v = cell.get(`${d}|${p}`) ?? 0;
                  return (
                    <td
                      key={p}
                      className="tnum px-3 py-2.5 text-right"
                      style={v === 0 ? { color: "var(--text-muted)" } : undefined}
                    >
                      {v === 0 ? "–" : fmtIdr(v)}
                    </td>
                  );
                })}
                <td className="tnum px-4 py-2.5 text-right font-medium">
                  {fmtIdr(rowTotal(d))}
                </td>
              </tr>
            ))}
          </tbody>
          {divisiNames.length > 0 && (
            <tfoot>
              <tr className="text-xs">
                <td className="px-4 py-2.5 font-medium">Total</td>
                {platformNames.map((p) => (
                  <td key={p} className="tnum px-3 py-2.5 text-right font-medium">
                    {fmtIdr(colTotal(p))}
                  </td>
                ))}
                <td className="tnum px-4 py-2.5 text-right font-semibold">
                  {fmtIdr(s.biaya)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left text-sm font-semibold">
            Tren bulanan
          </caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Bulan</th>
              <th className="px-3 py-2 text-right font-medium">Biaya marketing</th>
              <th className="px-3 py-2 text-right font-medium">Top-up masuk dompet</th>
              <th className="px-4 py-2 text-right font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {bulanan.map((b) => (
              <tr key={b.bulan} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2.5">{monthLabelLong(b.bulan)}</td>
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(b.biaya)}</td>
                <td className="tnum px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {fmtIdr(b.topup)}
                </td>
                <td className="tnum px-4 py-2.5 text-right text-xs text-[var(--text-muted)]">
                  {fmtIdr(b.topup - b.biaya)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint px-4 pb-4">
          Selisih besar bukan berarti salah — top-up bulan ini bisa dibelanjakan
          bulan depan. Yang harus cocok adalah saldo dompetnya.
        </p>
      </section>
    </div>
  );
}
