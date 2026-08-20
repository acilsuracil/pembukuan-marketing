import Link from "next/link";
import { connection } from "next/server";
import TransferForm from "@/components/TransferForm";
import TxTable from "@/components/TxTable";
import { fmtIdr, todayISO } from "@/lib/format";
import { dompetOptions } from "@/lib/opts";
import { hasPerm } from "@/lib/policy";
import { listTransaksi, totalSaldo } from "@/lib/queries";
import { requirePerm } from "@/lib/session";
import { first, num, type SP } from "@/lib/sp";

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requirePerm("addBelanja");
  const sp = await searchParams;

  const dompet = dompetOptions();
  // Riwayat pindahan: hanya sisi keluarnya yang ditampilkan — sisi masuknya
  // baris yang sama dilihat dari dompet seberang, jadi menampilkan keduanya
  // membuat satu pindahan terlihat seperti dua kejadian.
  const riwayat = listTransaksi({ jenis: "transfer_keluar", limit: 25 });

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pindah saldo</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Memindahkan uang antar-dompet sendiri, mis. Bank Jago → Jenius. Ini
            bukan biaya — Total Biaya Marketing tidak bergerak, dan total saldo
            semua dompet ({fmtIdr(totalSaldo())}) juga tetap sama.
          </p>
        </div>
        <Link href={first(sp, "back") || "/dompet"} className="btn btn-ghost">
          Kembali
        </Link>
      </div>

      <TransferForm
        today={todayISO()}
        dompet={dompet}
        defaultAsalId={num(sp, "asal")}
        backHref={first(sp, "back") || "/dompet"}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Pindahan terakhir</h2>
        <TxTable
          rows={riwayat}
          canEdit={false}
          canDelete={hasPerm(me, "deleteBelanja")}
          emptyText="Belum ada pindah saldo antar-dompet."
        />
      </section>
    </div>
  );
}
