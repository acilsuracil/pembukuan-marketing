import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import OpnameForm from "@/components/OpnameForm";
import StatTile from "@/components/StatTile";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr, fmtSigned, JENIS_LABEL, todayISO } from "@/lib/format";
import { hasPerm } from "@/lib/policy";
import { getSaldoDompet, listOpname, mutasiDompet } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function DompetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const me = await requireUser();
  const { id } = await params;
  const d = getSaldoDompet(Number(id));
  if (!d) notFound();

  const mutasi = mutasiDompet(d.id);
  const opname = listOpname(d.id);
  const kurang = d.min_saldo > 0 && d.sisa < d.min_saldo;

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {d.name}
            {d.sisa < 0 ? (
              <Badge tone="critical">saldo minus</Badge>
            ) : kurang ? (
              <Badge tone="serious">di bawah minimum</Badge>
            ) : null}
          </h1>
          <p className="tnum mt-0.5 text-sm text-[var(--text-muted)]">
            {[d.bank, d.no_rek, d.pemilik].filter(Boolean).join(" · ") ||
              "tanpa detail rekening"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dompet" className="btn btn-ghost">
            Semua dompet
          </Link>
          {hasPerm(me, "addBelanja") && (
            <>
              <Link href={`/belanja/harian?dompet=${d.id}`} className="btn btn-primary">
                Input harian
              </Link>
              <Link
                href={`/belanja/baru?dompet=${d.id}&jenis=topup&back=/dompet/${d.id}`}
                className="btn btn-ghost"
              >
                Catat top-up
              </Link>
              <Link
                href={`/dompet/transfer?asal=${d.id}&back=/dompet/${d.id}`}
                className="btn btn-ghost"
              >
                Pindah saldo
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Sisa saldo"
          value={fmtIdr(d.sisa)}
          sub={d.last_tanggal ? `mutasi terakhir ${fmtDate(d.last_tanggal)}` : "belum ada mutasi"}
          hero
        />
        <StatTile
          label="Saldo awal"
          value={fmtIdr(d.saldo_awal)}
          sub={`per ${fmtDate(d.tanggal_awal)}`}
        />
        <StatTile label="Total masuk" value={fmtIdr(d.masuk)} sub={`top-up ${fmtIdr(d.topup)}`} />
        <StatTile
          label="Total keluar"
          value={fmtIdr(d.keluar)}
          sub={`belanja ${fmtIdr(d.belanja)}`}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="px-4 pt-4 text-left text-xs text-[var(--text-muted)]">
              Mutasi terbaru di atas. Saldo berjalan dihitung dari saldo awal, jadi
              angka paling atas sama dengan sisa saldo sekarang.
            </caption>
            <thead>
              <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 font-medium">Jenis</th>
                <th className="px-3 py-2 font-medium">Untuk</th>
                <th className="px-3 py-2 text-right font-medium">Mutasi</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {mutasi.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-xs text-[var(--text-muted)]"
                  >
                    Belum ada mutasi. Catat top-up pertama, lalu belanjanya lewat
                    input harian.
                  </td>
                </tr>
              )}
              {mutasi.map((t) => (
                <tr key={t.id} className="border-b border-[var(--hairline)] last:border-0">
                  <td className="tnum px-4 py-2.5 whitespace-nowrap">
                    {fmtDate(t.tanggal)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge tone={t.jenis === "topup" ? "warning" : "muted"}>
                      {JENIS_LABEL[t.jenis]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                    {t.platform_name ?? t.keterangan ?? "–"}
                    <span className="block text-[var(--text-muted)]">
                      {[t.divisi_name, t.brand_name, t.akun_iklan_name]
                        .filter(Boolean)
                        .join(" · ") || t.keterangan}
                    </span>
                  </td>
                  <td
                    className="tnum px-3 py-2.5 text-right whitespace-nowrap"
                    style={{
                      color:
                        t.delta_saldo > 0
                          ? "var(--flow-in)"
                          : t.delta_saldo < 0
                            ? "var(--flow-out)"
                            : undefined,
                    }}
                  >
                    {fmtSigned(t.delta_saldo)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">
                    {fmtIdr(t.saldo_setelah)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          {hasPerm(me, "manageDompet") && (
            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold">Cek saldo (opname)</h2>
              <p className="mt-0.5 mb-3 text-xs text-[var(--text-muted)]">
                Bandingkan saldo panel dengan saldo asli di banking.
              </p>
              <OpnameForm dompetId={d.id} today={todayISO()} saldoTercatat={d.sisa} />
            </section>
          )}

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Riwayat cek saldo</h2>
            {opname.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Belum ada. Cek berkala membuat selisih ketemu saat masih kecil.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5 text-xs">
                {opname.map((o) => (
                  <li key={o.id} className="border-b border-[var(--hairline)] pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum">{fmtDate(o.tanggal)}</span>
                      <span
                        className="tnum font-medium"
                        style={{
                          color:
                            o.selisih === 0
                              ? "var(--success-text)"
                              : "var(--status-critical)",
                        }}
                      >
                        {o.selisih === 0 ? "cocok" : `selisih ${fmtSigned(o.selisih)}`}
                      </span>
                    </div>
                    <div className="tnum mt-0.5 text-[var(--text-muted)]">
                      asli {fmtIdr(o.saldo_aktual)} · panel {fmtIdr(o.saldo_tercatat)}
                    </div>
                    {o.catatan && (
                      <div className="mt-0.5 text-[var(--text-muted)]">{o.catatan}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {opname.some((o) => o.selisih !== 0) && hasPerm(me, "addBelanja") && (
              <Link
                href={`/belanja/baru?dompet=${d.id}&jenis=koreksi&back=/dompet/${d.id}`}
                className="btn btn-ghost mt-3 w-full px-2.5 py-1 text-xs"
              >
                Catat koreksi saldo
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
