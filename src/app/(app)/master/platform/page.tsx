import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import { currentMonth } from "@/lib/format";
import { seriesVar } from "@/lib/palette";
import {
  getPlatform,
  listDivisi,
  listDompet,
  masterUsage,
  platformStats,
} from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getPlatform(editId) : undefined;

  const month = currentMonth();
  const rows = platformStats(month).map((r) => ({
    ...r,
    used: masterUsage("platform", r.id),
  }));
  const divisi = listDivisi();
  const dompet = listDompet();

  const fields: Field[] = [
    {
      kind: "text",
      name: "name",
      label: "Nama category",
      value: editing?.name,
      required: true,
      minLength: 2,
      placeholder: "mis. Meta Ads",
    },
    {
      kind: "select",
      name: "divisi_id",
      label: "Divisi default",
      value: editing?.divisi_id,
      empty: "— tidak ada —",
      options: divisi.map((d) => ({ value: d.id, label: d.name })),
      hint: "Hanya mengisi formulir otomatis. Divisi yang mengikat laporan tetap kolom di tiap transaksi, jadi category ini boleh dipakai divisi lain.",
    },
    {
      kind: "select",
      name: "dompet_id",
      label: "Dompet pembayar default",
      value: editing?.dompet_id,
      empty: "— tidak ada —",
      options: dompet.map((d) => ({ value: d.id, label: d.name })),
      hint: "Dipakai mengisi input harian. Kosongkan kalau category ini dibayar finance langsung.",
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
          kind="platform"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.name}"` : "Tambah category"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah category"}
          listHref="/master/platform"
        />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Divisi default</th>
              <th className="px-3 py-2 font-medium">Dompet</th>
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
                  {r.akun_count > 0 && (
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {r.akun_count} akun iklan
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.divisi_name ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.dompet_name ?? "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="platform"
                    id={r.id}
                    name={r.name}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master/platform?edit=${r.id}`}
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
