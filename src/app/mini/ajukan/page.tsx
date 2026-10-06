import { redirect } from "next/navigation";
import { connection } from "next/server";
import PengajuanForm from "@/components/PengajuanForm";
import { formOptions } from "@/lib/opts";
import { hasPerm } from "@/lib/policy";
import { getUser } from "@/lib/session";
import { first, type SP } from "@/lib/sp";

/** Formulir pengajuan di dalam Telegram — komponen dan aksi yang sama dengan aplikasi. */
export default async function MiniAjukanPage({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const me = await getUser();
  // Sesi habis atau belum masuk: kembali ke layar pembuka, yang akan menukar
  // initData Telegram dengan sesi baru — bukan ke /login.
  if (!me) redirect("/mini");
  if (!hasPerm(me, "addPengajuan"))
    return <p className="card p-5 text-sm">Akun Anda tidak punya izin membuat pengajuan.</p>;

  const sp = await searchParams;
  const opts = formOptions();
  const d = Number(first(sp, "divisi"));
  const divisiAwal = opts.divisi.some((x) => x.id === d) ? d : undefined;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold">Ajukan dana</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Masuk sebagai {me.name || me.username}. Setelah diajukan, pengajuan dikirim
          ke grup divisinya untuk disetujui leader.
        </p>
      </div>
      <PengajuanForm {...opts} mini divisiAwal={divisiAwal} />
    </div>
  );
}
