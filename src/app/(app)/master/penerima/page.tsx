import { connection } from "next/server";
import MasterForm, { type Field } from "@/components/MasterForm";
import MasterRowActions from "@/components/MasterRowActions";
import { Badge } from "@/components/ui";
import { fmtDate, fmtIdr } from "@/lib/format";
import { getPenerima, masterUsage, penerimaStats } from "@/lib/queries";
import { first, type SP } from "@/lib/sp";

export default async function PenerimaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const sp = await searchParams;
  const editId = Number(first(sp, "edit")) || 0;
  const editing = editId ? getPenerima(editId) : undefined;

  const rows = penerimaStats().map((r) => ({
    ...r,
    used: masterUsage("penerima", r.id),
  }));

  const fields: Field[] = [
    {
      kind: "text",
      name: "nama",
      label: "Nama pemilik rekening",
      value: editing?.nama,
      required: true,
      minLength: 2,
      placeholder: "mis. Dewi Kurnia / PT Agensi Digital",
    },
    {
      kind: "text",
      name: "bank",
      label: "Bank",
      value: editing?.bank,
      placeholder: "mis. BCA",
    },
    {
      kind: "text",
      name: "no_rek",
      label: "Nomor rekening",
      value: editing?.no_rek,
      placeholder: "mis. 1234567890",
    },
    {
      kind: "text",
      name: "note",
      label: "Catatan",
      value: editing?.note,
      placeholder: "mis. endorser TikTok, fee 10%",
    },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
      <section className="card p-4 sm:p-5">
        <MasterForm
          kind="penerima"
          fields={fields}
          editingId={editing?.id}
          title={editing ? `Ubah "${editing.nama}"` : "Tambah rekening penerima"}
          submitLabel={editing ? "Simpan perubahan" : "Tambah penerima"}
          listHref="/master/penerima"
        />
        <p className="hint mt-3 border-t border-[var(--hairline)] pt-3">
          Rekening yang tersimpan di sini yang dipakai formulir pengajuan menyusun
          baris &quot;No &amp; nama rekening penerima&quot; untuk finance — jadi
          tidak perlu diketik ulang, dan tidak ada nomor yang salah satu digit.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Rekening</th>
              <th className="px-3 py-2 text-right font-medium">Total dibayar</th>
              <th className="px-3 py-2 text-right font-medium">Baris</th>
              <th className="px-3 py-2 font-medium">Terakhir</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-xs text-[var(--text-muted)]"
                >
                  Belum ada rekening penerima.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2.5">
                  <span className={r.archived ? "text-[var(--text-muted)]" : ""}>
                    {r.nama}
                  </span>
                  {r.archived === 1 && <Badge>arsip</Badge>}
                  {r.note && (
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                  {r.bank || "–"} {r.no_rek}
                </td>
                <td className="tnum px-3 py-2.5 text-right">{fmtIdr(r.total)}</td>
                <td className="tnum px-3 py-2.5 text-right text-[var(--text-muted)]">
                  {r.tx_count}
                </td>
                <td className="tnum px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  {r.last_tanggal ? fmtDate(r.last_tanggal) : "–"}
                </td>
                <td className="px-4 py-2.5">
                  <MasterRowActions
                    kind="penerima"
                    id={r.id}
                    name={r.nama}
                    archived={r.archived === 1}
                    used={r.used}
                    editHref={`/master/penerima?edit=${r.id}`}
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
