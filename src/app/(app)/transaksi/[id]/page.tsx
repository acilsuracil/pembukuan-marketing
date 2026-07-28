import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import BuktiPanel from "@/components/Bukti";
import DeleteTxButton from "@/components/DeleteTxButton";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr, fmtRate, fmtUsdt } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { hasPerm, isLocked } from "@/lib/policy";
import { attachmentsOf, getTransaction, pendingRequestFor } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function DetailTransaksiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  const t = getTransaction(Number(id));
  if (!t) notFound();

  const bukti = attachmentsOf(t.id);
  const pending = pendingRequestFor(t.id);
  const locked = isLocked(t.date);
  const canEdit = hasPerm(user, "edit");
  const canDelete = hasPerm(user, "delete");

  const rows: Array<[string, React.ReactNode]> = [
    ["Tanggal", fmtDate(t.date)],
    ["Jenis", t.type === "in" ? "Uang masuk" : "Uang keluar"],
    [
      "Brand",
      t.brand_name ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: seriesVar(t.brand_slot) }}
          />
          {t.brand_name}
        </span>
      ) : (
        "—"
      ),
    ],
    ["Kategori", t.category_name ?? "—"],
    ["Nominal", fmtUsdt(t.amount_usdt)],
    [
      "Fee agency",
      t.fee_pct > 0 ? (
        <>
          {fmtUsdt(t.fee_pct_usdt)}{" "}
          <span className="text-xs text-[var(--text-muted)]">
            ({t.fee_pct}% dari nominal)
          </span>
        </>
      ) : (
        "—"
      ),
    ],
    ["Biaya jaringan", t.fee_usdt > 0 ? fmtUsdt(t.fee_usdt) : "—"],
    [
      "Arus kas",
      `${t.type === "in" ? "+" : "−"}${fmtUsdt(t.flow_usdt)}`,
    ],
    [
      "Kurs dipakai",
      <>
        {fmtRate(t.eff_rate)}{" "}
        <span className="text-xs text-[var(--text-muted)]">
          (
          {t.type === "in"
            ? "kurs beli"
            : t.rate_source === "warisan"
              ? "warisan dari pemasukan terakhir"
              : "override manual"}
          )
        </span>
      </>,
    ],
    [
      "Nilai rupiah",
      t.eff_rate === null ? "—" : fmtIdr(t.flow_usdt * t.eff_rate),
    ],
    ["Keterangan", t.description || "—"],
    ["Pihak terkait", t.counterparty || "—"],
    [
      "Tx hash",
      t.tx_hash ? <span className="break-all">{t.tx_hash}</span> : "—",
    ],
    [
      "Dicatat oleh",
      `${t.created_by_name ?? "—"}${t.updated_at ? " · pernah diubah" : ""}`,
    ],
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <Link
          href="/transaksi"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ← Kembali ke daftar transaksi
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Transaksi #{t.id}
          </h1>
          {locked && <Badge tone="muted">🔒 Periode terkunci</Badge>}
          {pending && <Badge tone="serious">Menunggu keputusan admin</Badge>}
        </div>
      </div>

      {pending && (
        <section
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--status-serious) 40%, transparent)",
            background: "color-mix(in srgb, var(--status-serious) 8%, transparent)",
          }}
        >
          <div className="font-medium">
            Ada pengajuan {pending.type === "edit" ? "perubahan" : "penghapusan"}{" "}
            dari {pending.requester_name ?? "staff"}
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Alasan: {pending.reason}
          </p>
          <Link href="/pengajuan" className="btn btn-ghost mt-3 text-xs">
            {hasPerm(user, "approveRequest") ? "Tinjau pengajuan" : "Lihat pengajuan"}
          </Link>
        </section>
      )}

      <section className="card">
        <dl className="divide-y divide-[var(--hairline)]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-2.5 text-sm">
              <dt className="w-36 shrink-0 text-[var(--text-secondary)]">{k}</dt>
              <dd className="tnum min-w-0 flex-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <BuktiPanel
        txId={t.id}
        items={bukti}
        canUpload={!locked && hasPerm(user, "uploadBukti")}
        canDeleteAny={hasPerm(user, "deleteAnyBukti")}
        currentUserId={user.id}
      />

      <section className="card flex flex-wrap items-start gap-3 p-4">
        {locked ? (
          <p className="text-xs text-[var(--text-muted)]">
            🔒 Transaksi ini berada di periode yang sudah dikunci, jadi tidak bisa
            diubah maupun dihapus.
          </p>
        ) : (
          <>
            <Link href={`/transaksi/${t.id}/ubah`} className="btn btn-ghost text-xs">
              {canEdit ? "Ubah transaksi" : "Ajukan perubahan"}
            </Link>
            {pending ? (
              <span className="text-xs text-[var(--text-muted)]">
                Pengajuan lain harus diputuskan dulu sebelum bisa mengajukan ulang.
              </span>
            ) : (
              <DeleteTxButton txId={t.id} canDeleteDirectly={canDelete} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
