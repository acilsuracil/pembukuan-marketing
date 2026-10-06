import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import {
  getAkunIklan,
  listAkunIklan,
  listBrand,
  listDompet,
  listPlatform,
  masterUsage,
} from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function AkunIklanPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getAkunIklan(editId) : undefined;

  const rows = listAkunIklan({ includeArchived: true }).map((r) => ({
    ...r,
    used: masterUsage("akun_iklan", r.id),
  }));
  const platform = listPlatform();
  const brand = listBrand();
  const dompet = listDompet();

  const fields: Field[] = [
    {
      kind: "select",
      name: "platform_id",
      label: "Category",
      value: editing?.platform_id,
      required: true,
      empty: "— pilih category —",
      options: platform.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      kind: "text",
      name: "name",
      label: "Nama / ID akun iklan",
      value: editing?.name,
      required: true,
      minLength: 2,
      placeholder: "mis. PN138-ADS-01",
    },
    {
      kind: "select",
      name: "brand_id",
      label: "Brand default",
      value: editing?.brand_id,
      empty: "— tidak ada —",
      options: brand.map((b) => ({ value: b.id, label: b.name })),
    },
    {
      kind: "select",
      name: "dompet_id",
      label: "Dompet pembayar",
      value: editing?.dompet_id,
      empty: "— tidak ada —",
      options: dompet.map((d) => ({ value: d.id, label: d.name })),
      hint: "Akun yang auto-payment-nya jatuh ke Bank Jago diisi di sini, supaya mutasi bank mudah dicocokkan per akun.",
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
          kind="akun_iklan"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.name}"` : "Tambah akun iklan"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah akun iklan"}
          listHref="/master/akun-iklan"
        />
        <p className="hint mt-3 border-t border-[var(--hairline)] pt-3">
          Akun iklan itu opsional. Gunanya saat satu category punya beberapa akun
          yang ditagih terpisah — tanpa ini, mutasi Bank Jago tidak bisa
          dicocokkan lebih halus dari nama category-nya.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Akun iklan</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Brand default</th>
              <th className="px-3 py-2 font-medium">Dompet</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-xs text-[var(--text-muted)]"
                >
                  Belum ada akun iklan. Boleh dilewati kalau tiap category hanya
                  punya satu akun.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className={r.archived ? "text-[var(--text-muted)]" : ""}>
                    {r.name}
                  </span>
                  {r.archived === 1 && <Badge>arsip</Badge>}
                  {r.note && (
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.platform_name}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.brand_name ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.dompet_name ?? "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="akun_iklan"
                    id={r.id}
                    name={r.name}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master/akun-iklan?edit=${r.id}`}
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
