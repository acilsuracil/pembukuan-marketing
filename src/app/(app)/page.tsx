import Link from "next/link";
import { connection } from "next/server";
import GroupBars from "@/components/charts/GroupBars";
import StatTile from "@/components/StatTile";
import StatusBadge from "@/components/StatusBadge";
import TxTable from "@/components/TxTable";
import { Badge } from "@/components/ui";
import {
  currentMonth,
  daysBetween,
  firstDayOfMonth,
  fmtDate,
  fmtIdr,
  lastDayOfMonth,
  monthLabelLong,
  todayISO,
} from "@/lib/format";
import { hasPerm } from "@/lib/policy";
import {
  biayaHari,
  getSummary,
  groupBiaya,
  listPengajuan,
  listTransaksi,
  outstandingPengajuan,
  saldoDompet,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function RingkasanPage() {
  await connection();
  const me = await requireUser();

  const today = todayISO();
  const month = currentMonth();
  const periode = { from: firstDayOfMonth(month), to: lastDayOfMonth(month) };

  const bulan = getSummary(periode);
  const hariIni = biayaHari(today);
  const dompet = saldoDompet();
  const totalSaldo = dompet.reduce((s, d) => s + d.sisa, 0);
  const outstanding = outstandingPengajuan();
  const perDivisi = groupBiaya("divisi", periode);
  const perPlatform = groupBiaya("platform", periode);
  const belumCair = listPengajuan({ outstanding: true, limit: 6 });
  const terbaru = listTransaksi({ limit: 8 });

  const perhatian = dompet.filter((d) => d.sisa < 0 || (d.min_saldo > 0 && d.sisa < d.min_saldo));

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ringkasan</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Bulan {monthLabelLong(month)} · data per {fmtDate(today)}
          </p>
        </div>
        {hasPerm(me, "addBelanja") && (
          <div className="flex flex-wrap gap-2">
            <Link href="/belanja/harian" className="btn btn-primary">
              Input harian dompet
            </Link>
            {hasPerm(me, "addPengajuan") && (
              <Link href="/pengajuan/baru" className="btn btn-ghost">
                Buat pengajuan
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Total biaya marketing — ${monthLabelLong(month)}`}
          value={fmtIdr(bulan.biaya)}
          sub={`${bulan.txCount} baris tercatat bulan ini`}
          hero
        />
        <StatTile
          label="Pengeluaran hari ini"
          value={fmtIdr(hariIni)}
          sub={fmtDate(today)}
        />
        <StatTile
          label="Saldo semua dompet"
          value={fmtIdr(totalSaldo)}
          sub={
            perhatian.length > 0
              ? `${perhatian.length} dompet perlu perhatian`
              : `${dompet.length} dompet aktif`
          }
        />
        <StatTile
          label="Diminta, belum cair"
          value={fmtIdr(outstanding.total)}
          sub={`${outstanding.n} pengajuan menggantung`}
        />
      </div>

      {perhatian.length > 0 && (
        <section
          role="alert"
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--status-serious) 45%, transparent)",
            background: "color-mix(in srgb, var(--status-serious) 8%, transparent)",
          }}
        >
          <p className="font-semibold">Saldo dompet perlu perhatian</p>
          <ul className="mt-2 space-y-1 text-xs">
            {perhatian.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/dompet/${d.id}`} className="font-medium underline">
                  {d.name}
                </Link>
                <span className="tnum">{fmtIdr(d.sisa)}</span>
                {d.sisa < 0 ? (
                  <Badge tone="critical">minus</Badge>
                ) : (
                  <Badge tone="serious">di bawah {fmtIdr(d.min_saldo)}</Badge>
                )}
                <span className="text-[var(--text-muted)]">
                  {d.sisa < 0
                    ? "kemungkinan ada top-up yang belum dicatat"
                    : "auto payment bisa gagal kalau tidak segera diisi"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupBars
          data={perDivisi}
          title="Biaya per divisi"
          subtitle={monthLabelLong(month)}
          unit="divisi"
        />
        <GroupBars
          data={perPlatform}
          title="Biaya per category"
          subtitle={monthLabelLong(month)}
          unit="category"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* min-w-0 wajib: tanpa itu kolom 1fr tidak mau lebih sempit dari lebar
            minimum tabel (banyak sel nowrap), sehingga kartu di kanan terdorong
            keluar halaman. Dengan ini tabel yang kelebaran menggulir di dalam
            kartunya sendiri (overflow-x-auto di TxTable). */}
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Transaksi terbaru</h2>
            <Link href="/belanja" className="text-xs underline">
              lihat semua
            </Link>
          </div>
          <TxTable
            rows={terbaru}
            canEdit={false}
            canDelete={false}
            emptyText="Belum ada transaksi. Mulai dari pengajuan dana, atau catat pengeluaran langsung."
          />
        </section>

        <section className="card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Menunggu dana cair</h2>
            <Link href="/pengajuan?status=outstanding" className="text-xs underline">
              semua
            </Link>
          </div>
          {belumCair.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Tidak ada pengajuan yang menggantung.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {belumCair.map((g) => {
                const umur = daysBetween(g.tanggal, today);
                return (
                  <li
                    key={g.id}
                    className="border-b border-[var(--hairline)] pb-2.5 text-xs last:border-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/pengajuan/${g.id}`}
                        className="font-medium hover:underline"
                      >
                        {g.keterangan}
                      </Link>
                      <span className="tnum whitespace-nowrap">{fmtIdr(g.nominal)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[var(--text-muted)]">
                      <StatusBadge status={g.status} leaderOk={Boolean(g.leader_at)} />
                      <span>
                        {g.tujuan === "dompet" ? g.dompet_name : g.penerima_nama}
                      </span>
                      <span
                        className="tnum"
                        style={{
                          color:
                            umur >= 7
                              ? "var(--status-critical)"
                              : umur >= 3
                                ? "var(--status-serious)"
                                : undefined,
                        }}
                      >
                        · {umur} hari
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
