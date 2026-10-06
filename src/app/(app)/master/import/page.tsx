import { connection } from "next/server";
import ImportForm from "@/components/ImportForm";
import { listBrand, listDivisi } from "@/lib/queries";
import { requirePerm } from "@/lib/session";

export default async function ImportPage() {
  await connection();
  await requirePerm("addBelanja");

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Impor dari Google Spreadsheet</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Kolom yang dibaca: <strong>Tanggal</strong>, <strong>Category</strong>,{" "}
          <strong>Divisi</strong>, <strong>Jenis Pembayaran</strong>,{" "}
          <strong>Rekening</strong>, <strong>Keterangan</strong>,{" "}
          <strong>Nominal</strong>. Sheet lama yang judul kolomnya masih{" "}
          <strong>Platform</strong> tetap terbaca. Baris judul kolomnya dicari
          sendiri, jadi judul bulan dan blok ringkasan di sebelahnya boleh ikut
          tersalin.
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Semua baris masuk sebagai <strong>pengeluaran dari finance langsung</strong>{" "}
          — tidak menyentuh saldo dompet mana pun. Nama master yang belum ada
          ditampilkan dulu di pratinjau sebelum dibuat.
        </p>
      </section>

      <ImportForm
        brand={listBrand().map((b) => ({ id: b.id, label: b.name }))}
        divisi={listDivisi().map((d) => ({ id: d.id, label: d.name }))}
      />
    </div>
  );
}
