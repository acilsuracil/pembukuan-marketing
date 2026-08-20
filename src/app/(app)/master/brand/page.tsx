import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import { currentMonth, fmtDate, fmtIdr, monthLabelLong, pct } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import { brandStats, getBrand, masterUsage } from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function BrandPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getBrand(editId) : undefined;

  const month = currentMonth();
  const rows = brandStats(month).map((r) => ({
    ...r,
    used: masterUsage("brand", r.id),
  }));

  const fields: Field[] = [
    {
      kind: "text",
      name: "name",
      label: "Nama brand",
      value: editing?.name,
      required: true,
      minLength: 2,
    },
    {
      kind: "text",
      name: "pic",
      label: "PIC",
      value: editing?.pic,
      placeholder: "opsional",
    },
    { kind: "color", value: editing?.color_slot },
    {
      kind: "money",
      name: "budget_idr",
      label: "Budget per bulan",
      value: editing?.budget_idr,
      hint: "Kosong atau 0 = tanpa budget.",
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
          kind="brand"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.name}"` : "Tambah brand"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah brand"}
          listHref="/master/brand"
        />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left text-xs text-[var(--text-muted)]">
            Realisasi bulan {monthLabelLong(month)}
          </caption>
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">PIC</th>
              <th className="px-3 py-2 text-right font-medium">Bulan ini</th>
              <th className="px-3 py-2 text-right font-medium">Budget</th>
              <th className="px-3 py-2 text-right font-medium">Total biaya</th>
              <th className="px-3 py-2 font-medium">Terakhir</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-xs text-[var(--text-muted)]"
                >
                  Belum ada brand.
                </td>
              </tr>
            )}
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
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.pic || "–"}
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
                <td className="tnum px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  {r.last_tanggal ? fmtDate(r.last_tanggal) : "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="brand"
                    id={r.id}
                    name={r.name}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master/brand?edit=${r.id}`}
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
