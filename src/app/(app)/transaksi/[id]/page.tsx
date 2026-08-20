import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import BuktiPanel from "@/components/Bukti";
import DeleteTxButton from "@/components/DeleteTxButton";
import TxForm from "@/components/TxForm";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr, fmtRate, fmtUsdt } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { hasPerm, isLocked } from "@/lib/policy";
import {
  attachmentsOf,
  getTransaction,
  incomeRates,
  listBrands,
  listCategories,
  pendingRequestFor,
  splitMembers,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function DetailTransaksiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  const t = getTransaction(Number(id));
  if (!t) notFound();

  // Bukti transfer satu pembayaran melekat pada baris pertama grupnya, bukan
  // pada masing-masing porsi. Dibaca dari pemegangnya supaya dua dari tiga porsi
  // tidak tampil seolah tidak punya bukti sama sekali.
  const bukti = attachmentsOf(t.split_head_id);
  const siblings = t.split_group ? splitMembers(t.split_group) : [];
  const pending = pendingRequestFor(t.id);
  const locked = isLocked(t.date);
  const canEdit = hasPerm(user, "edit");
  const canDelete = hasPerm(user, "delete");

  // Formulir dibuka lewat query, bukan state klien: tahan refresh, bisa ditautkan,
  // dan halamannya tetap Server Component yang menegakkan syaratnya sendiri.
  const sp = await searchParams;
  const editing = sp.ubah !== undefined && !locked && !pending;

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
          {t.split_count > 1 && (
            <Badge tone="muted">
              ⧉ Porsi {t.split_index} dari {t.split_count}
            </Badge>
          )}
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

      {/* Satu porsi tidak bisa dibaca sendirian: nominalnya lebih kecil dari
          pembayaran yang sebenarnya terjadi, dan bukti transfernya ada di baris
          lain. Grupnya dibentangkan di sini supaya asal-usulnya kelihatan tanpa
          harus menebak dari daftar. */}
      {siblings.length > 1 && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-sm font-semibold">
            Bagian dari satu pembayaran yang dibagi
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Total pembayarannya{" "}
            <strong className="tnum">
              {fmtUsdt(siblings.reduce((n, s) => n + s.flow_usdt, 0))}
            </strong>
            , dipakai {siblings.length} brand. Tiap porsi tercatat sebagai
            transaksi tersendiri supaya laporan per brand tetap benar.
          </p>

          <ul className="mt-3 divide-y divide-[var(--hairline)]">
            {siblings.map((s, i) => {
              const here = s.id === t.id;
              return (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-8 shrink-0 text-xs text-[var(--text-muted)]">
                    {i + 1}/{siblings.length}
                  </span>
                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: seriesVar(s.brand_slot) }}
                    />
                    <span className="truncate">{s.brand_name ?? "— tanpa brand —"}</span>
                  </span>
                  <span className="tnum shrink-0">{fmtUsdt(s.flow_usdt)}</span>
                  <span className="w-24 shrink-0 text-right text-xs">
                    {here ? (
                      <span className="text-[var(--text-muted)]">porsi ini</span>
                    ) : (
                      <Link
                        href={`/transaksi/${s.id}`}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        #{s.id} →
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Bukti transfernya menempel di porsi pertama (#{t.split_head_id}) dan
            ditampilkan di setiap porsi. <strong>Mengubah</strong> di sini hanya
            mengenai porsi ini — kalau pembagiannya yang salah, hapus lalu catat
            ulang. <strong>Menghapus</strong> membuang seluruh {siblings.length}{" "}
            porsi sekaligus, karena menyisakan sebagian akan membuat pembukuannya
            mencatat pembayaran yang lebih kecil dari kenyataan.
          </p>
        </section>
      )}

      {editing ? (
        <section className="card p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold">
            {canEdit ? "Ubah transaksi" : "Ajukan perubahan"}
          </h2>
          <TxForm
            categories={listCategories(true)}
            brands={listBrands(true)}
            inRates={incomeRates()}
            initial={t}
            canEditDirectly={canEdit}
          />
        </section>
      ) : (
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
      )}

      <BuktiPanel
        txId={t.split_head_id}
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
        ) : pending ? (
          <span className="text-xs text-[var(--text-muted)]">
            Pengajuan yang berjalan harus diputuskan dulu sebelum transaksi ini
            bisa diubah atau dihapus.
          </span>
        ) : (
          <>
            {/* Formulir dibuka di halaman ini juga — panel bukti di atas tetap
                di tempatnya, jadi lampiran yang sudah ada tidak hilang dari
                pandangan saat mengubah. */}
            <Link
              href={editing ? `/transaksi/${t.id}` : `/transaksi/${t.id}?ubah`}
              scroll={false}
              className="btn btn-ghost text-xs"
            >
              {editing
                ? "Tutup formulir"
                : canEdit
                  ? "Ubah transaksi"
                  : "Ajukan perubahan"}
            </Link>
            <DeleteTxButton
              txId={t.id}
              canDeleteDirectly={canDelete}
              splitCount={t.split_count}
            />
          </>
        )}
      </section>
    </div>
  );
}
