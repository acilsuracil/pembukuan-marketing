import Link from "next/link";
import { fmtDate, fmtIdr, JENIS_LABEL, SUMBER_LABEL } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import type { TxRow } from "@/lib/types";
import DeleteTxButton from "./DeleteTxButton";
import { Badge } from "./ui";

/** Warna badge per jenis — top-up dibedakan tegas karena ia bukan biaya. */
const TONE: Record<string, "muted" | "good" | "warning" | "serious" | "critical"> = {
  belanja: "muted",
  topup: "warning",
  refund: "good",
  biaya_dompet: "serious",
  koreksi: "muted",
  transfer_keluar: "muted",
  transfer_masuk: "muted",
};

/** Arah pindahan ditulis lengkap, dari dompet mana ke dompet mana. */
function jalurTransfer(t: TxRow): string {
  const lawan = t.pasangan_dompet_name ?? "dompet lain";
  return t.jenis === "transfer_keluar"
    ? `${t.dompet_name ?? "–"} → ${lawan}`
    : `${lawan} → ${t.dompet_name ?? "–"}`;
}

export default function TxTable({
  rows,
  canEdit,
  canDelete,
  emptyText = "Belum ada transaksi yang cocok dengan filter ini.",
  total,
}: {
  rows: TxRow[];
  canEdit: boolean;
  canDelete: boolean;
  emptyText?: string;
  /** Baris jumlah di kaki tabel, dijumlahkan di kolom "Ke biaya". */
  total?: Array<{ label: string; biaya: number }>;
}) {
  return (
    <section className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
            <th className="px-4 py-2 font-medium">Tanggal</th>
            <th className="px-3 py-2 font-medium">Jenis</th>
            <th className="px-3 py-2 font-medium">Divisi / category</th>
            <th className="px-3 py-2 font-medium">Brand</th>
            <th className="px-3 py-2 font-medium">Sumber</th>
            <th className="px-3 py-2 text-right font-medium">Nominal</th>
            <th className="px-3 py-2 text-right font-medium">Ke biaya</th>
            {(canEdit || canDelete) && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-10 text-center text-xs text-[var(--text-muted)]"
              >
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((t) => (
            <tr
              key={t.id}
              className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--wash)]"
            >
              <td className="tnum px-4 py-2.5 whitespace-nowrap">{fmtDate(t.tanggal)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Badge tone={TONE[t.jenis] ?? "muted"}>{JENIS_LABEL[t.jenis]}</Badge>
                {t.keterangan && (
                  <span className="mt-0.5 block max-w-[220px] truncate text-xs text-[var(--text-muted)]">
                    {t.keterangan}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs">
                {t.divisi_name ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: seriesVar(t.divisi_slot) }}
                    />
                    {t.divisi_name}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">–</span>
                )}
                <span className="block text-[var(--text-muted)]">
                  {t.platform_name ?? "–"}
                  {t.akun_iklan_name ? ` · ${t.akun_iklan_name}` : ""}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                {t.brand_name ?? "–"}
              </td>
              <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                {t.pasangan_id
                  ? jalurTransfer(t)
                  : t.jenis === "belanja" && t.sumber
                    ? t.sumber === "dompet"
                      ? (t.dompet_name ?? SUMBER_LABEL.dompet)
                      : SUMBER_LABEL.finance
                    : (t.dompet_name ?? "–")}
                {t.penerima_nama && (
                  <span className="block text-[var(--text-muted)]">
                    {t.penerima_nama}
                  </span>
                )}
              </td>
              <td className="tnum px-3 py-2.5 text-right whitespace-nowrap">
                {fmtIdr(t.nominal)}
              </td>
              <td className="tnum px-3 py-2.5 text-right whitespace-nowrap">
                {t.delta_biaya === 0 ? (
                  <span className="text-xs text-[var(--text-muted)]">–</span>
                ) : (
                  fmtIdr(t.delta_biaya)
                )}
              </td>
              {(canEdit || canDelete) && (
                <td className="px-4 py-2.5">
                  <span className="flex items-center justify-end gap-1.5">
                    {t.pengajuan_id && (
                      <Link
                        href={`/pengajuan/${t.pengajuan_id}`}
                        className="btn btn-ghost px-2 py-1 text-xs"
                        title="Lihat rincian pembayaran: rekening, porsi brand, link, dan bukti transfer"
                      >
                        Rincian
                      </Link>
                    )}
                    {canEdit && (
                      <Link
                        href={`/belanja/${t.id}/ubah`}
                        className="btn btn-ghost px-2 py-1 text-xs"
                      >
                        Ubah
                      </Link>
                    )}
                    {canDelete && !t.pengajuan_id && (
                      <DeleteTxButton
                        id={t.id}
                        label={
                          t.pasangan_id
                            ? `pindah saldo ${jalurTransfer(t)} ${fmtIdr(t.nominal)} tanggal ${fmtDate(t.tanggal)} (kedua sisinya sekaligus)`
                            : `${JENIS_LABEL[t.jenis]} ${fmtIdr(t.nominal)} tanggal ${fmtDate(t.tanggal)}`
                        }
                      />
                    )}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {total && total.length > 0 && rows.length > 0 && (
          <tfoot>
            {total.map((t, i) => (
              <tr
                key={t.label}
                className={
                  i === 0
                    ? "border-t-2 border-[var(--hairline)]"
                    : "border-t border-[var(--hairline)]"
                }
              >
                <td colSpan={6} className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)]">
                  {t.label}
                </td>
                <td className="tnum px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                  {fmtIdr(t.biaya)}
                </td>
                {(canEdit || canDelete) && <td />}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </section>
  );
}
