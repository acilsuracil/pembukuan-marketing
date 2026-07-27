import Link from "next/link";
import { connection } from "next/server";
import TxForm from "@/components/TxForm";
import { getLockUntil, hasPerm } from "@/lib/policy";
import { incomeRates, listBrands, listCategories } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function TransaksiBaruPage() {
  await connection();
  const user = await requireUser();
  const brands = listBrands();
  const lock = getLockUntil();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <Link
          href="/transaksi"
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ← Kembali ke daftar transaksi
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Catat transaksi</h1>
        {lock && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            🔒 Periode sampai <span className="tnum">{lock}</span> terkunci — pilih
            tanggal setelahnya.
          </p>
        )}
      </div>

      {brands.length === 0 ? (
        <section className="card px-6 py-12 text-center">
          <h2 className="text-base font-semibold">Belum ada brand</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            Setiap pengeluaran harus ditandai brand-nya, jadi buat dulu minimal
            satu brand sebelum mencatat transaksi.
          </p>
          <Link href="/brand" className="btn btn-primary mt-5">
            {hasPerm(user, "manageBrand") ? "Buat brand" : "Lihat halaman brand"}
          </Link>
        </section>
      ) : (
        <section className="card p-4 sm:p-6">
          <TxForm
            categories={listCategories()}
            brands={brands}
            inRates={incomeRates()}
            canEditDirectly={hasPerm(user, "edit")}
          />
        </section>
      )}
    </div>
  );
}
