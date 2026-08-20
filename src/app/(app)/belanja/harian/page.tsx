import Link from "next/link";
import { connection } from "next/server";
import HarianForm from "@/components/HarianForm";
import TxTable from "@/components/TxTable";
import { fmtDate, fmtIdr, todayISO } from "@/lib/format";
import { dompetOptions, txOptions } from "@/lib/opts";
import { hasPerm } from "@/lib/policy";
import { getSummary, listTransaksi } from "@/lib/queries";
import { requirePerm } from "@/lib/session";
import { num, type SP } from "@/lib/sp";

export default async function HarianPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await connection();
  const me = await requirePerm("addBelanja");
  const sp = await searchParams;

  const today = todayISO();
  const dompet = dompetOptions();
  const opts = txOptions();

  // Yang sudah masuk hari ini ditampilkan di bawah formulir: tanpa ini, mudah
  // menginput dua kali untuk tanggal yang sama tanpa sadar.
  const hariIni = listTransaksi({ from: today, to: today, jenis: "belanja" });
  const ringkas = getSummary({ from: today, to: today });

  return (
    <div className="space-y-5">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Input harian dompet
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Salin mutasi dompet hari itu: satu baris per platform / akun iklan.
            Semua tersimpan sebagai belanja dari dompet yang dipilih.
          </p>
        </div>
        <Link href="/belanja" className="btn btn-ghost">
          Daftar transaksi
        </Link>
      </div>

      {dompet.length === 0 ? (
        <section className="card p-6 text-center">
          <p className="text-sm">Belum ada dompet.</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Tambahkan Bank Jago / Jenius beserta saldo awalnya dulu, supaya sisa
            saldonya bisa dihitung.
          </p>
          <Link href="/dompet" className="btn btn-primary mt-4">
            Tambah dompet
          </Link>
        </section>
      ) : (
        <HarianForm
          today={today}
          dompet={dompet}
          divisi={opts.divisi}
          platform={opts.platform}
          brand={opts.brand}
          akun={opts.akun}
          defaultDompetId={num(sp, "dompet")}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Sudah tercatat hari ini · {fmtDate(today)}
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          Total biaya hari ini {fmtIdr(ringkas.biaya)} dari {ringkas.txCount} baris.
        </p>
        <TxTable
          rows={hariIni}
          canEdit={hasPerm(me, "editBelanja")}
          canDelete={hasPerm(me, "deleteBelanja")}
          emptyText="Belum ada belanja yang tercatat hari ini."
        />
      </section>
    </div>
  );
}
