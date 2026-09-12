import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import { currentMonth, fmtDate, fmtIdr, monthLabelLong } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { getJenisBayar, jenisBayarStats, masterUsage } from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function JenisBayarPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getJenisBayar(editId) : undefined;

  const month = currentMonth();
  const rows = jenisBayarStats(month).map((r) => ({
    ...r,
    used: masterUsage("jenis_bayar", r.id),
  }));

  const fields: Field[] = [
    {
      kind: "text",
      name: "name",
      label: "Nama jenis pembayaran",
      value: editing?.name,
      required: true,
      minLength: 2,
      placeholder: "mis. Perpanjang",
    },
    { kind: "color", value: editing?.color_slot },
    {
      kind: "text",
      name: "note",
      label: "Catatan",
      value: editing?.note,
      placeholder: "opsional",
    },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
      <section className="card p-4 sm:p-5">
        <MasterForm
          kind="jenis_bayar"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.name}"` : "Tambah jenis pembayaran"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah jenis pembayaran"}
          listHref="/master/jenis-bayar"
        />
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Ini sebutan kerja untuk sebuah pengeluaran — Perpanjang, Gajian,
          Pelunasan. Tidak mempengaruhi saldo maupun total biaya; yang mengatur
          itu jenis transaksinya sendiri.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left text-xs text-[var(--text-muted)]">
            Realisasi bulan {monthLabelLong(month)}
          </caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Jenis pembayaran</th>
              <th className="px-3 py-2 text-right font-medium">Baris</th>
              <th className="px-3 py-2 text-right font-medium">Bulan ini</th>
              <th className="px-3 py-2 text-right font-medium">Total biaya</th>
              <th className="px-3 py-2 font-medium">Terakhir</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: seriesVar(r.color_slot) }}
                    />
                    <span className={r.archived ? "text-[var(--text-muted)]" : ""}>
                      {r.name}
                    </span>
                    {r.archived === 1 && <Badge>arsip</Badge>}
                  </span>
                  {r.note && (
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-xs text-[var(--text-secondary)]">
                  {r.tx_count}
                </td>
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(r.biaya_bulan)}</td>
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(r.biaya_total)}</td>
                <td className="tnum px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  {r.last_tanggal ? fmtDate(r.last_tanggal) : "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="jenis_bayar"
                    id={r.id}
                    name={r.name}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master/jenis-bayar?edit=${r.id}`}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--text-muted)]"
                >
                  Belum ada jenis pembayaran. Tambahkan dari formulir di sebelah.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
