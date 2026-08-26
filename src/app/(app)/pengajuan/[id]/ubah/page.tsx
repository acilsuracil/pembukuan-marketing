import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import PengajuanForm from "@/components/PengajuanForm";
import { formOptions } from "@/lib/opts";
import { brandPengajuan, getPengajuan } from "@/lib/queries";
import { requirePerm } from "@/lib/session";

export default async function PengajuanUbahPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  await requirePerm("editPengajuan");
  const { id } = await params;
  const g = getPengajuan(Number(id));
  if (!g) notFound();

  // Yang sudah dibayar punya baris buku besar yang lahir dari angkanya; pintu
  // ubahnya ditutup di sini, bukan cuma disembunyikan tombolnya.
  if (g.status === "dibayar") redirect(`/pengajuan/${g.id}`);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Ubah pengajuan</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {g.keterangan} ·{" "}
          <Link href={`/pengajuan/${g.id}`} className="underline">
            kembali ke detail
          </Link>
        </p>
      </div>

      <PengajuanForm initial={g} porsiAwal={brandPengajuan(g.id)} {...formOptions()} />
    </div>
  );
}
