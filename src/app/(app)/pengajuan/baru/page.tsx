import Link from "next/link";
import { connection } from "next/server";
import PengajuanForm from "@/components/PengajuanForm";
import { formOptions } from "@/lib/opts";
import { requirePerm } from "@/lib/session";

export default async function PengajuanBaruPage() {
  await connection();
  await requirePerm("addPengajuan");
  const opts = formOptions();

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="text-xl font-semibold tracking-tight">Pengajuan baru</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Isi sekali di sini, teks untuk finance dirakit sendiri di kanan.{" "}
          <Link href="/pengajuan" className="underline">
            Kembali ke daftar
          </Link>
        </p>
      </div>

      <PengajuanForm {...opts} />
    </div>
  );
}
