import Link from "next/link";
import { connection } from "next/server";
import TxForm from "@/components/TxForm";
import { JENIS_MANUAL } from "@/lib/jenis";
import { txOptions } from "@/lib/opts";
import { requirePerm } from "@/lib/session";
import { first, num, type SP } from "@/lib/sp";
import type { Jenis } from "@/lib/types";

export default async function BelanjaBaruPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  await requirePerm("addBelanja");
  const sp = await searchParams;
  const jenisRaw = first(sp, "jenis");

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Catat transaksi</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Untuk satu baris: endorse, vendor SEO, biaya admin bank, atau koreksi
          saldo. Belanja iklan harian lebih cepat lewat{" "}
          <Link href="/belanja/harian" className="underline">
            input harian dompet
          </Link>
          .
        </p>
      </div>

      <TxForm
        {...txOptions()}
        presetDompetId={num(sp, "dompet")}
        presetJenis={JENIS_MANUAL.includes(jenisRaw as Jenis) ? (jenisRaw as Jenis) : undefined}
        backHref={first(sp, "back") || "/belanja"}
      />
    </div>
  );
}
