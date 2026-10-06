import Link from "next/link";
import { connection } from "next/server";
import PengajuanFilters from "@/components/PengajuanFilters";
import StatTile from "@/components/StatTile";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui";
import {
  currentMonth,
  daysBetween,
  fmtDate,
  fmtIdr,
  judulKeterangan,
  todayISO,
} from "@/lib/format";
import { hasPerm } from "@/lib/policy";
import { listPengajuan, pengajuanTally, type PengajuanFilter } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { first, type SP } from "@/lib/sp";
import type { PengajuanStatus } from "@/lib/types";

const STATUS_SET: PengajuanStatus[] = [
  "draft",
  "diajukan",
  "disetujui",
  "ditolak",
  "dibayar",
];

export default async function PengajuanListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requireUser();
  const sp = await searchParams;

  const statusRaw = first(sp, "status");
  const q = first(sp, "q");

  const filter: PengajuanFilter = {
    status: STATUS_SET.includes(statusRaw as PengajuanStatus)
      ? (statusRaw as PengajuanStatus)
      : undefined,
    outstanding: statusRaw === "outstanding" || undefined,
    q: q || undefined,
    limit: 300,
  };

  const rows = listPengajuan(filter);
  const tally = pengajuanTally();
  const today = todayISO();
  const month = currentMonth();

  const byStatus = (s: PengajuanStatus) =>
    tally.find((t) => t.status === s) ?? { status: s, n: 0, total: 0 };
  const belumCair = {
    n: byStatus("diajukan").n + byStatus("disetujui").n,
    total: byStatus("diajukan").total + byStatus("disetujui").total,
  };
  const cairBulanIni = listPengajuan({ status: "dibayar" })
    .filter((r) => (r.tanggal_bayar ?? "").startsWith(month))
    .reduce((s, r) => s + (r.nominal_cair ?? r.nominal), 0);

  const canAdd = hasPerm(me, "addPengajuan");

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pengajuan dana</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Permintaan dana ke finance, beserta apa yang sudah cair dan apa yang
            masih menggantung.
          </p>
        </div>
        {canAdd && (
          <Link href="/pengajuan/baru" className="btn btn-primary">
            Buat pengajuan
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Belum cair"
          value={fmtIdr(belumCair.total)}
          sub={`${belumCair.n} pengajuan diajukan / disetujui`}
        />
        <StatTile
          label="Cair bulan ini"
          value={fmtIdr(cairBulanIni)}
          sub="dana yang benar-benar turun"
        />
        <StatTile
          label="Draft"
          value={String(byStatus("draft").n)}
          sub={`${fmtIdr(byStatus("draft").total)} belum dikirim ke finance`}
        />
      </div>

      <PengajuanFilters status={statusRaw} q={q} />

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Keterangan</th>
              <th className="px-3 py-2 text-right font-medium">Nominal</th>
              <th className="px-3 py-2 font-medium">Tujuan dana</th>
              <th className="px-3 py-2 font-medium">Divisi / category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Umur</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-xs text-[var(--text-muted)]"
                >
                  Belum ada pengajuan yang cocok dengan filter ini.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const belum = r.status === "diajukan" || r.status === "disetujui";
              const umur = daysBetween(r.tanggal, today);
              return (
                <tr
                  key={r.id}
                  className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--wash)]"
                >
                  <td className="tnum px-4 py-2.5 whitespace-nowrap">
                    <Link href={`/pengajuan/${r.id}`} className="hover:underline">
                      {fmtDate(r.tanggal)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/pengajuan/${r.id}`} className="hover:underline">
                      {judulKeterangan(r.keterangan)}
                    </Link>
                    {(r.brand_count > 0 ? r.brand_ringkas : r.brand_name) && (
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {r.brand_count > 0
                          ? `${r.brand_count} brand · ${r.brand_ringkas}`
                          : r.brand_name}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right whitespace-nowrap">
                    {fmtIdr(r.nominal)}
                    {r.nominal_cair !== null && r.nominal_cair !== r.nominal && (
                      <span className="block text-xs text-[var(--text-muted)]">
                        cair {fmtIdr(r.nominal_cair)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.tujuan === "dompet" ? (
                      <>
                        <Badge tone="warning">dompet</Badge>{" "}
                        <span className="text-[var(--text-secondary)]">
                          {r.dompet_name}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--text-secondary)]">
                        {r.penerima_nama ?? "—"}
                        {r.penerima_bank && (
                          <span className="tnum block text-[var(--text-muted)]">
                            {r.penerima_bank} {r.penerima_no_rek}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                    {r.divisi_name ?? "—"}
                    <span className="block text-[var(--text-muted)]">
                      {r.platform_name ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} leaderOk={Boolean(r.leader_at)} />
                  </td>
                  <td className="tnum px-4 py-2.5 text-xs whitespace-nowrap">
                    {belum ? (
                      <span
                        style={{
                          color:
                            umur >= 7
                              ? "var(--status-critical)"
                              : umur >= 3
                                ? "var(--status-serious)"
                                : "var(--text-muted)",
                        }}
                      >
                        {umur} hari
                      </span>
                    ) : r.tanggal_bayar ? (
                      <span className="text-[var(--text-muted)]">
                        cair {fmtDate(r.tanggal_bayar)}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
