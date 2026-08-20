import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import { currentMonth, fmtDate, fmtIdr, monthLabelLong, pct } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { divisiStats, getDivisi, masterUsage } from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function DivisiPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getDivisi(editId) : undefined;

  const month = currentMonth();
  const rows = divisiStats(month).map((r) => ({
    ...r,
    used: masterUsage("divisi", r.id),
  }));

  const fields: Field[] = [
    {
      kind: "text",
      name: "name",
      label: "Nama divisi",
      value: editing?.name,
      required: true,
      minLength: 2,
      placeholder: "mis. Endorse",
    },
    { kind: "color", value: editing?.color_slot },
    {
      kind: "money",
      name: "budget_idr",
      label: "Budget per bulan",
      value: editing?.budget_idr,
      hint: "Kosong atau 0 = tanpa budget. Realisasi bulan berjalan dibandingkan ke angka ini.",
    },
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
          kind="divisi"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.name}"` : "Tambah divisi"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah divisi"}
          listHref="/master"
        />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left text-xs text-[var(--text-muted)]">
            Realisasi bulan {monthLabelLong(month)}
          </caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Divisi</th>
              <th className="px-3 py-2 text-right font-medium">Bulan ini</th>
              <th className="px-3 py-2 text-right font-medium">Budget</th>
              <th className="px-3 py-2 text-right font-medium">Total biaya</th>
              <th className="px-3 py-2 text-right font-medium">Baris</th>
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
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(r.biaya_bulan)}</td>
                <td className="tnum px-3 py-2.5 text-right text-xs text-[var(--text-muted)]">
                  {r.budget_idr > 0 ? (
                    <>
                      {fmtIdr(r.budget_idr)}
                      <span className="block">{pct(r.biaya_bulan, r.budget_idr, 0)}</span>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(r.biaya_total)}</td>
                <td className="tnum px-3 py-2.5 text-right text-[var(--text-muted)]">
                  {r.tx_count}
                </td>
                <td className="tnum px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  {r.last_tanggal ? fmtDate(r.last_tanggal) : "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="divisi"
                    id={r.id}
                    name={r.name}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master?edit=${r.id}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
