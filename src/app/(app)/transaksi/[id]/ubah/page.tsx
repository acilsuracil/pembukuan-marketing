import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import TxForm from "@/components/TxForm";
import { fmtDate } from "@/lib/format";
import { hasPerm, isLocked } from "@/lib/policy";
import {
  attachmentsOf,
  getTransaction,
  incomeRates,
  listBrands,
  listCategories,
  pendingRequestFor,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function UbahTransaksiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const user = await requireUser();
  const { id } = await params;
  const t = getTransaction(Number(id));
  if (!t) notFound();

  const locked = isLocked(t.date);
  const pending = pendingRequestFor(t.id);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <Link
          href={`/transaksi/${t.id}`}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ← Kembali ke detail transaksi
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {hasPerm(user, "edit") ? "Ubah transaksi" : "Ajukan perubahan"}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          #{t.id} · dicatat {fmtDate(t.date)}
        </p>
      </div>

      {locked ? (
        <section className="card px-6 py-12 text-center">
          <h2 className="text-base font-semibold">Periode terkunci</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            Transaksi tanggal {fmtDate(t.date)} ada di periode yang sudah dikunci
            admin, jadi tidak bisa diubah. Minta admin memundurkan kuncinya kalau
            memang perlu diperbaiki.
          </p>
        </section>
      ) : pending ? (
        <section className="card px-6 py-12 text-center">
          <h2 className="text-base font-semibold">Masih ada pengajuan berjalan</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            Pengajuan {pending.type === "edit" ? "perubahan" : "penghapusan"} dari{" "}
            {pending.requester_name ?? "staff"} belum diputuskan. Selesaikan itu
            dulu supaya tidak ada dua perubahan yang bertabrakan.
          </p>
          <Link href="/pengajuan" className="btn btn-primary mt-5">
            Buka pengajuan
          </Link>
        </section>
      ) : (
        <section className="card p-4 sm:p-6">
          <TxForm
            categories={listCategories(true)}
            brands={listBrands(true)}
            inRates={incomeRates()}
            initial={t}
            canEditDirectly={hasPerm(user, "edit")}
            buktiTaken={attachmentsOf(t.id).length}
          />
        </section>
      )}
    </div>
  );
}
