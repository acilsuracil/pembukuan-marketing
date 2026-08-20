import { notFound } from "next/navigation";
import { connection } from "next/server";
import TxForm from "@/components/TxForm";
import { fmtDate, fmtIdr, JENIS_LABEL } from "@/lib/format";
import { txOptions } from "@/lib/opts";
import { getTransaksi } from "@/lib/queries";
import { requirePerm } from "@/lib/session";

export default async function BelanjaUbahPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  await requirePerm("editBelanja");
  const { id } = await params;
  const t = getTransaksi(Number(id));
  if (!t) notFound();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Ubah transaksi</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {JENIS_LABEL[t.jenis]} {fmtIdr(t.nominal)} · {fmtDate(t.tanggal)}
          {t.pengajuan_id
            ? " · lahir dari pengajuan, tautannya tetap dipertahankan"
            : ""}
        </p>
      </div>

      <TxForm initial={t} {...txOptions()} />
    </div>
  );
}
