import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Bukti from "@/components/Bukti";
import CopyBox from "@/components/CopyBox";
import PengajuanActions from "@/components/PengajuanActions";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui";
import {
  fmtDate,
  fmtDateTime,
  fmtIdr,
  JENIS_LABEL,
  pisahLink,
  todayISO,
} from "@/lib/format";
import { rekLine } from "@/lib/opts";
import {
  bisaBayar,
  bisaLeader,
  bisaSetujuiBayar,
  keputusanOf,
  tahapOf,
  teksFinance,
} from "@/lib/persetujuan";
import { hasPerm } from "@/lib/policy";
import {
  attachmentsOf,
  brandPengajuan,
  getPengajuan,
  listTransaksi,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function PengajuanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const me = await requireUser();
  const { id } = await params;
  const g = getPengajuan(Number(id));
  if (!g) notFound();

  const rows = listTransaksi({ pengajuanId: g.id });
  const porsi = brandPengajuan(g.id);
  const links = pisahLink(g.links);

  const rek =
    g.tujuan === "dompet"
      ? rekLine(g.dompet_bank || g.dompet_name || "", g.dompet_no_rek ?? "", g.dompet_pemilik || g.dompet_name || "")
      : g.penerima_nama
        ? rekLine(g.penerima_bank ?? "", g.penerima_no_rek ?? "", g.penerima_nama)
        : "—";

  // Teks yang sama persis dengan yang diposting bot ke grup Telegram.
  const format = teksFinance(g);
  const tahap = tahapOf(g);
  const keputusan = keputusanOf(g.id);
  const buktiLinks = pisahLink(g.bukti_links);

  const canEdit = hasPerm(me, "editPengajuan");

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {g.keterangan}
            <StatusBadge status={g.status} leaderOk={Boolean(g.leader_at)} />
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Diajukan {fmtDate(g.tanggal)} · {fmtIdr(g.nominal)} ·{" "}
            {g.tujuan === "dompet" ? `ke ${g.dompet_name}` : "ke rekening penerima"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/pengajuan" className="btn btn-ghost">
            Daftar
          </Link>
          {canEdit && g.status !== "dibayar" && (
            <Link href={`/pengajuan/${g.id}/ubah`} className="btn btn-ghost">
              Ubah
            </Link>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Rincian</h2>
            <dl className="mt-3 text-sm">
              {[
                ["Nominal diminta", fmtIdr(g.nominal)],
                [
                  "Nominal cair",
                  g.nominal_cair !== null
                    ? fmtIdr(g.nominal_cair)
                    : g.status === "dibayar"
                      ? `${fmtIdr(g.nominal)} (penuh)`
                      : "–",
                ],
                ["Tanggal cair", g.tanggal_bayar ? fmtDate(g.tanggal_bayar) : "–"],
                ["Rekening tujuan", rek],
                ["Divisi", g.divisi_name ?? "–"],
                ["Category", g.platform_name ?? "–"],
                [
                  "Brand",
                  porsi.length > 0
                    ? porsi.map((p) => `${p.brand_name} ${fmtIdr(p.nominal)}`).join(" · ")
                    : (g.brand_name ?? "–"),
                ],
                [
                  "Link",
                  links.length === 0
                    ? "–"
                    : (
                        <span className="flex flex-col items-end gap-0.5">
                          {links.map((l) => (
                            // Hanya http/https yang lolos saat disimpan, jadi aman dijadikan href.
                            <a
                              key={l}
                              href={l}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="max-w-[260px] truncate underline"
                            >
                              {l.replace(/^https?:\/\//, "")}
                            </a>
                          ))}
                        </span>
                      ),
                ],
                ["Catatan internal", g.catatan || "–"],
                ["Dibuat", `${fmtDateTime(g.created_at)} oleh ${g.created_by_name ?? "–"}`],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] py-2 last:border-0"
                >
                  <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
                  <dd className="tnum text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Baris buku besar dari pengajuan ini</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Belum ada. Baris akan lahir sendiri begitu pengajuan ini ditandai
                dibayar — {g.tujuan === "dompet" ? "sebagai top-up dompet" : "sebagai pengeluaran"}.
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Tanggal</th>
                    <th className="py-2 font-medium">Jenis</th>
                    <th className="py-2 text-right font-medium">Nominal</th>
                    <th className="py-2 text-right font-medium">Pengaruh biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--hairline)] last:border-0">
                      <td className="tnum py-2">{fmtDate(t.tanggal)}</td>
                      <td className="py-2">
                        <Badge tone={t.jenis === "topup" ? "warning" : "muted"}>
                          {JENIS_LABEL[t.jenis]}
                        </Badge>
                        {t.dompet_name && (
                          <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                            {t.dompet_name}
                          </span>
                        )}
                      </td>
                      <td className="tnum py-2 text-right">{fmtIdr(t.nominal)}</td>
                      <td className="tnum py-2 text-right">
                        {t.delta_biaya === 0 ? (
                          <span className="text-xs text-[var(--text-muted)]">
                            belum jadi biaya
                          </span>
                        ) : (
                          fmtIdr(t.delta_biaya)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Bukti menempel pada baris buku besarnya, bukan pada pengajuannya —
              yang perlu dibuktikan adalah uang yang benar-benar pindah. */}
          {rows.map((t) => (
            <Bukti
              key={t.id}
              txId={t.id}
              items={attachmentsOf(t.id)}
              canUpload={hasPerm(me, "addBelanja")}
              canDeleteAny={hasPerm(me, "deleteBelanja")}
              currentUserId={me.id}
            />
          ))}
        </div>

        <div className="space-y-4">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Format untuk finance</h2>
            <p className="mt-0.5 mb-3 text-xs text-[var(--text-muted)]">
              Tempel apa adanya ke chat finance.
            </p>
            <CopyBox text={format} />
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Persetujuan</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {keputusan.map((k, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden>{k.setuju ? "✅" : "❌"}</span>
                  <span>
                    <span className="font-medium">{k.nama}</span>{" "}
                    <span className="text-[var(--text-muted)]">
                      {k.tahap === "leader" ? "leader" : "penyetuju pembayaran"} ·{" "}
                      {fmtDateTime(k.ts)}
                      {k.lewat === "telegram" ? " · Telegram" : ""}
                    </span>
                    {k.alasan && !k.setuju && (
                      <span className="block text-xs">Alasan: {k.alasan}</span>
                    )}
                  </span>
                </li>
              ))}
              {(tahap === "leader" || tahap === "bayar" || tahap === "siap") && (
                <li className="flex gap-2 text-[var(--text-muted)]">
                  <span aria-hidden>⏳</span>
                  {tahap === "leader"
                    ? "Menunggu leader divisi"
                    : tahap === "bayar"
                      ? "Menunggu penyetuju pembayaran"
                      : "Siap dibayar finance"}
                </li>
              )}
            </ol>
            {buktiLinks.length > 0 && (
              <div className="mt-3 border-t border-[var(--hairline)] pt-3 text-sm">
                <p className="text-xs text-[var(--text-muted)]">Bukti bayar (link)</p>
                {buktiLinks.map((l) => (
                  // Hanya http/https yang lolos saat disimpan, jadi aman dijadikan href.
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate underline"
                  >
                    {l.replace(/^https?:\/\//, "")}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold">Tindakan</h2>
            <PengajuanActions
              id={g.id}
              status={g.status}
              tujuan={g.tujuan}
              nominal={g.nominal}
              dompetName={g.dompet_name}
              today={todayISO()}
              canEdit={canEdit}
              canMarkPaid={bisaBayar(me, g) === null}
              canCancelPay={me.role === "finance" || me.role === "owner"}
              tahap={tahap}
              canLeader={bisaLeader(me, g)}
              tolakBayar={bisaSetujuiBayar(me, g)}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
