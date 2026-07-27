import { redirect } from "next/navigation";
import { connection } from "next/server";
import LockForm from "@/components/admin/LockForm";
import { fmtDate } from "@/lib/format";
import { getLockUntil, hasPerm } from "@/lib/policy";
import { requireUser } from "@/lib/session";
import { storageStatus } from "@/lib/storage";

export default async function AdminPengaturanPage() {
  await connection();
  const me = await requireUser();

  // Tab pertama butuh izin kunci periode; kalau user hanya punya izin admin
  // lain, antar dia ke tab yang memang boleh dia buka.
  if (!hasPerm(me, "lockPeriod")) {
    if (hasPerm(me, "manageUsers")) redirect("/admin/pengguna");
    if (hasPerm(me, "viewActivity")) redirect("/admin/aktivitas");
    redirect("/?e=no-access");
  }

  const lock = getLockUntil();
  const storage = storageStatus();
  const supa = storage.backend === "supabase";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Kunci periode</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Setelah laporan suatu periode selesai dikerjakan, kunci tanggalnya
          supaya angkanya tidak berubah lagi di belakang hari.
        </p>

        <p className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm">
          <span aria-hidden>{lock ? "🔒" : "🔓"}</span>
          {lock ? (
            <span>
              Terkunci sampai{" "}
              <strong className="tnum">{fmtDate(lock)}</strong>
            </span>
          ) : (
            <span className="text-[var(--text-secondary)]">
              Tidak ada kunci aktif — semua periode masih bisa diubah.
            </span>
          )}
        </p>

        <div className="mt-4">
          <LockForm current={lock} />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Penyimpanan bukti transfer</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Tempat berkas bukti disimpan. Diatur lewat environment variable, bukan
          dari sini.
        </p>

        <dl className="mt-4 text-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] py-2">
            <dt className="text-xs text-[var(--text-muted)]">Backend aktif</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              <span
                aria-hidden
                style={{
                  color: supa ? "var(--success-text)" : "var(--status-warning)",
                }}
              >
                {supa ? "✓" : "⚠"}
              </span>
              {supa ? "Supabase Storage" : "Disk lokal / volume"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] py-2">
            <dt className="text-xs text-[var(--text-muted)]">Bucket</dt>
            <dd className="font-medium">{storage.bucket}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-xs text-[var(--text-muted)]">Host</dt>
            <dd className="font-medium">{storage.url || "—"}</dd>
          </div>
        </dl>

        <p className="hint mt-2">
          {supa
            ? "Bukti disimpan di bucket privat Supabase dan tetap disajikan lewat route yang memeriksa sesi — tidak ada URL publik, dan service key tidak pernah sampai ke browser."
            : "Belum ada SUPABASE_URL / SUPABASE_SERVICE_KEY, jadi bukti disimpan di disk. Di Railway, isi kedua env itu atau pastikan volume terpasang supaya berkas tidak hilang saat redeploy."}
        </p>
      </section>
    </div>
  );
}
